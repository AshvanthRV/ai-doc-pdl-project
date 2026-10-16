const express = require('express');
const router = express.Router();
const { getDb } = require('../db');
const { authenticateToken, authorizeRole } = require('../auth');

// Create appointment (patient)
router.post('/', authenticateToken, authorizeRole('patient'), (req, res) => {
  try {
    const { doctor_id, appointment_date, start_time, end_time, consultation_type, reason, patient_condition, ai_diagnosis, urgency_level, symptoms } = req.body;

    if (!doctor_id || !appointment_date || !start_time || !end_time) {
      return res.status(400).json({ error: 'Doctor ID, date, start time, and end time are required' });
    }

    const db = getDb();

    // Check if slot is already booked
    const existing = db.prepare(`
      SELECT id FROM appointments
      WHERE doctor_id = ? AND appointment_date = ? AND start_time = ? AND status IN ('pending', 'confirmed')
    `).get(doctor_id, appointment_date, start_time);

    if (existing) {
      return res.status(409).json({ error: 'This time slot is already booked' });
    }

    const aiDiagnosisStr = typeof ai_diagnosis === 'object' ? JSON.stringify(ai_diagnosis) : (ai_diagnosis || '');
    const symptomsStr = Array.isArray(symptoms) ? symptoms.join(', ') : (symptoms || '');

    const result = db.prepare(`
      INSERT INTO appointments (
        patient_id, doctor_id, appointment_date, start_time, end_time,
        consultation_type, reason, patient_condition, ai_diagnosis, urgency_level, symptoms
      )
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `).run(
      req.user.id, doctor_id, appointment_date, start_time, end_time,
      consultation_type || 'in-person', reason || '',
      patient_condition || '', aiDiagnosisStr, urgency_level || 'moderate', symptomsStr
    );

    // Create notification for doctor
    const patient = db.prepare('SELECT name FROM patients WHERE id = ?').get(req.user.id);
    const notifMsg = patient_condition
      ? `${patient.name} requested consultation for: ${patient_condition} (${(urgency_level || 'moderate').toUpperCase()} urgency) on ${appointment_date} at ${start_time}.`
      : `${patient.name} has requested an appointment on ${appointment_date} at ${start_time}.`;

    db.prepare(`
      INSERT INTO notifications (user_id, user_type, title, message, type)
      VALUES (?, 'doctor', 'New Appointment Request', ?, 'info')
    `).run(doctor_id, notifMsg);

    const appointment = db.prepare(`
      SELECT a.*, d.name as doctor_name, d.specialty as doctor_specialty, p.name as patient_name
      FROM appointments a
      JOIN doctors d ON a.doctor_id = d.id
      JOIN patients p ON a.patient_id = p.id
      WHERE a.id = ?
    `).get(result.lastInsertRowid);

    res.status(201).json({ message: 'Appointment booked successfully', appointment });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// Get appointments for patient
router.get('/patient', authenticateToken, authorizeRole('patient'), (req, res) => {
  try {
    const db = getDb();
    const { status, upcoming } = req.query;

    let query = `
      SELECT a.*, d.name as doctor_name, d.specialty as doctor_specialty, d.avatar_url as doctor_avatar,
             d.consultation_fee, d.qualification as doctor_qualification
      FROM appointments a
      JOIN doctors d ON a.doctor_id = d.id
      WHERE a.patient_id = ?
    `;
    const params = [req.user.id];

    if (status) {
      query += ' AND a.status = ?';
      params.push(status);
    }

    if (upcoming === 'true') {
      query += ' AND a.appointment_date >= date("now")';
    }

    query += ' ORDER BY a.appointment_date DESC, a.start_time DESC';

    const appointments = db.prepare(query).all(...params);
    res.json(appointments);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// Get appointments for doctor
router.get('/doctor', authenticateToken, authorizeRole('doctor'), (req, res) => {
  try {
    const db = getDb();
    const { status, date, upcoming } = req.query;

    let query = `
      SELECT a.*, p.name as patient_name, p.phone as patient_phone, p.email as patient_email,
             p.gender as patient_gender, p.date_of_birth as patient_dob, p.blood_group as patient_blood_group
      FROM appointments a
      JOIN patients p ON a.patient_id = p.id
      WHERE a.doctor_id = ?
    `;
    const params = [req.user.id];

    if (status) {
      query += ' AND a.status = ?';
      params.push(status);
    }

    if (date) {
      query += ' AND a.appointment_date = ?';
      params.push(date);
    }

    if (upcoming === 'true') {
      query += ' AND a.appointment_date >= date("now")';
    }

    query += ' ORDER BY a.appointment_date ASC, a.start_time ASC';

    const appointments = db.prepare(query).all(...params);
    res.json(appointments);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// Get full appointment & clinical history for a specific patient with this doctor
router.get('/doctor/patient/:patientId', authenticateToken, authorizeRole('doctor'), (req, res) => {
  try {
    const db = getDb();
    const appointments = db.prepare(`
      SELECT a.*, p.name as patient_name, p.phone as patient_phone, p.email as patient_email,
             p.gender as patient_gender, p.date_of_birth as patient_dob, p.blood_group as patient_blood_group,
             p.address as patient_address
      FROM appointments a
      JOIN patients p ON a.patient_id = p.id
      WHERE a.doctor_id = ? AND a.patient_id = ?
      ORDER BY a.appointment_date DESC, a.start_time DESC
    `).all(req.user.id, req.params.patientId);

    const patient = db.prepare('SELECT id, name, email, phone, date_of_birth, gender, blood_group, address FROM patients WHERE id = ?').get(req.params.patientId);

    res.json({ patient, appointments });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// Update appointment status (doctor)
router.put('/:id/status', authenticateToken, authorizeRole('doctor'), (req, res) => {
  try {
    const { status, notes, prescription } = req.body;
    const validStatuses = ['pending', 'confirmed', 'completed', 'cancelled', 'no-show'];
    if (!validStatuses.includes(status)) {
      return res.status(400).json({ error: 'A valid appointment status is required' });
    }
    const db = getDb();

    const appointment = db.prepare('SELECT * FROM appointments WHERE id = ?').get(req.params.id);
    if (!appointment || appointment.doctor_id !== req.user.id) {
      return res.status(404).json({ error: 'Appointment not found' });
    }

    let updateQuery = 'UPDATE appointments SET status = ?, updated_at = CURRENT_TIMESTAMP';
    const params = [status];

    if (notes) {
      updateQuery += ', notes = ?';
      params.push(notes);
    }
    if (prescription) {
      updateQuery += ', prescription = ?';
      params.push(prescription);
    }

    updateQuery += ' WHERE id = ?';
    params.push(req.params.id);

    db.prepare(updateQuery).run(...params);

    // Notify patient
    const doctor = db.prepare('SELECT name FROM doctors WHERE id = ?').get(appointment.doctor_id);
    const statusMessages = {
      confirmed: `Your appointment with ${doctor.name} on ${appointment.appointment_date} at ${appointment.start_time} has been confirmed.`,
      cancelled: `Your appointment with ${doctor.name} on ${appointment.appointment_date} has been cancelled.`,
      completed: `Your appointment with ${doctor.name} has been marked as completed.`,
      'no-show': `You were marked as no-show for your appointment with ${doctor.name} on ${appointment.appointment_date}.`
    };

    if (statusMessages[status]) {
      db.prepare(`
        INSERT INTO notifications (user_id, user_type, title, message, type)
        VALUES (?, 'patient', ?, ?, ?)
      `).run(
        appointment.patient_id,
        `Appointment ${status.charAt(0).toUpperCase() + status.slice(1)}`,
        statusMessages[status],
        status === 'confirmed' ? 'success' : status === 'cancelled' ? 'warning' : 'info'
      );
    }

    const updated = db.prepare(`
      SELECT a.*, p.name as patient_name, d.name as doctor_name
      FROM appointments a
      JOIN patients p ON a.patient_id = p.id
      JOIN doctors d ON a.doctor_id = d.id
      WHERE a.id = ?
    `).get(req.params.id);

    res.json({ message: `Appointment ${status}`, appointment: updated });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// Cancel appointment (patient)
router.put('/:id/cancel', authenticateToken, authorizeRole('patient'), (req, res) => {
  try {
    const db = getDb();
    const appointment = db.prepare('SELECT * FROM appointments WHERE id = ? AND patient_id = ?').get(req.params.id, req.user.id);

    if (!appointment) {
      return res.status(404).json({ error: 'Appointment not found' });
    }

    if (appointment.status === 'completed' || appointment.status === 'cancelled') {
      return res.status(400).json({ error: 'Cannot cancel this appointment' });
    }

    db.prepare('UPDATE appointments SET status = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?').run('cancelled', req.params.id);

    // Notify doctor
    const patient = db.prepare('SELECT name FROM patients WHERE id = ?').get(req.user.id);
    db.prepare(`
      INSERT INTO notifications (user_id, user_type, title, message, type)
      VALUES (?, 'doctor', 'Appointment Cancelled', ?, 'warning')
    `).run(appointment.doctor_id, `${patient.name} has cancelled their appointment on ${appointment.appointment_date} at ${appointment.start_time}.`);

    res.json({ message: 'Appointment cancelled' });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// Add review
router.post('/:id/review', authenticateToken, authorizeRole('patient'), (req, res) => {
  try {
    const { rating, comment } = req.body;
    const db = getDb();

    const appointment = db.prepare('SELECT * FROM appointments WHERE id = ? AND patient_id = ? AND status = ?').get(req.params.id, req.user.id, 'completed');
    if (!appointment) {
      return res.status(400).json({ error: 'Can only review completed appointments' });
    }

    // Check if already reviewed
    const existingReview = db.prepare('SELECT id FROM reviews WHERE appointment_id = ?').get(req.params.id);
    if (existingReview) {
      return res.status(409).json({ error: 'Already reviewed this appointment' });
    }

    db.prepare(`
      INSERT INTO reviews (patient_id, doctor_id, appointment_id, rating, comment)
      VALUES (?, ?, ?, ?, ?)
    `).run(req.user.id, appointment.doctor_id, appointment.id, rating, comment || '');

    // Update doctor rating
    const avgRating = db.prepare('SELECT AVG(rating) as avg_rating, COUNT(*) as total FROM reviews WHERE doctor_id = ?').get(appointment.doctor_id);
    db.prepare('UPDATE doctors SET rating = ?, total_reviews = ? WHERE id = ?').run(
      Math.round(avgRating.avg_rating * 10) / 10,
      avgRating.total,
      appointment.doctor_id
    );

    res.status(201).json({ message: 'Review submitted successfully' });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

module.exports = router;

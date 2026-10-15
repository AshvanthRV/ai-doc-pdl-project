const bcrypt = require('bcryptjs');
const { getDb } = require('./db');

function seed() {
  const db = getDb();

  // Check if data already exists
  const existingDoctors = db.prepare('SELECT COUNT(*) as count FROM doctors').get();
  if (existingDoctors.count > 0) {
    console.log('Database already seeded. Skipping...');
    return;
  }

  console.log('Seeding database...');

  const hashedPassword = bcrypt.hashSync('password123', 10);

  // Insert doctors
  const insertDoctor = db.prepare(`
    INSERT INTO doctors (name, email, password, specialty, qualification, experience_years, consultation_fee, bio, avatar_url, rating, total_reviews)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `);

  const doctors = [
    {
      name: 'Dr. Sarah Mitchell',
      email: 'sarah@clinic.com',
      specialty: 'Cardiology',
      qualification: 'MD, DM Cardiology',
      experience: 15,
      fee: 1500,
      bio: 'Dr. Sarah Mitchell is a renowned cardiologist with over 15 years of experience in treating complex cardiac conditions. She specializes in interventional cardiology and preventive heart care.',
      avatar: 'https://api.dicebear.com/7.x/avataaars/svg?seed=sarah&backgroundColor=b6e3f4',
      rating: 4.9,
      reviews: 234
    },
    {
      name: 'Dr. James Wilson',
      email: 'james@clinic.com',
      specialty: 'Dermatology',
      qualification: 'MD, DVD',
      experience: 12,
      fee: 1200,
      bio: 'Dr. James Wilson is an expert dermatologist known for his advanced treatments in skin disorders, cosmetic dermatology, and laser therapy. He has published over 30 research papers.',
      avatar: 'https://api.dicebear.com/7.x/avataaars/svg?seed=james&backgroundColor=c0aede',
      rating: 4.7,
      reviews: 189
    },
    {
      name: 'Dr. Priya Sharma',
      email: 'priya@clinic.com',
      specialty: 'Pediatrics',
      qualification: 'MD Pediatrics, Fellowship in Neonatology',
      experience: 10,
      fee: 1000,
      bio: 'Dr. Priya Sharma is a compassionate pediatrician who has dedicated her career to child healthcare. She specializes in neonatal care and childhood developmental disorders.',
      avatar: 'https://api.dicebear.com/7.x/avataaars/svg?seed=priya&backgroundColor=ffd5dc',
      rating: 4.8,
      reviews: 312
    },
    {
      name: 'Dr. Michael Chen',
      email: 'michael@clinic.com',
      specialty: 'Orthopedics',
      qualification: 'MS Orthopedics, Fellowship in Joint Replacement',
      experience: 18,
      fee: 2000,
      bio: 'Dr. Michael Chen is one of the leading orthopedic surgeons specializing in joint replacement, sports injuries, and spine surgery with over 5000 successful surgeries.',
      avatar: 'https://api.dicebear.com/7.x/avataaars/svg?seed=michael&backgroundColor=d1d4f9',
      rating: 4.9,
      reviews: 456
    },
    {
      name: 'Dr. Emily Roberts',
      email: 'emily@clinic.com',
      specialty: 'Neurology',
      qualification: 'MD, DM Neurology',
      experience: 14,
      fee: 1800,
      bio: 'Dr. Emily Roberts is a board-certified neurologist with extensive experience in treating neurological disorders including epilepsy, stroke, and neurodegenerative diseases.',
      avatar: 'https://api.dicebear.com/7.x/avataaars/svg?seed=emily&backgroundColor=c1f4b6',
      rating: 4.6,
      reviews: 178
    },
    {
      name: 'Dr. Rajesh Patel',
      email: 'rajesh@clinic.com',
      specialty: 'General Medicine',
      qualification: 'MD Internal Medicine',
      experience: 20,
      fee: 800,
      bio: 'Dr. Rajesh Patel is a highly experienced general physician who provides comprehensive primary care services. He is known for his patient-centered approach and thorough diagnostic skills.',
      avatar: 'https://api.dicebear.com/7.x/avataaars/svg?seed=rajesh&backgroundColor=ffdfbf',
      rating: 4.5,
      reviews: 567
    },
    {
      name: 'Dr. Lisa Thompson',
      email: 'lisa@clinic.com',
      specialty: 'Ophthalmology',
      qualification: 'MS Ophthalmology, Fellowship in Retina',
      experience: 11,
      fee: 1300,
      bio: 'Dr. Lisa Thompson is a skilled ophthalmologist specializing in retinal diseases, cataract surgery, and LASIK procedures. She uses the latest technology for precision eye care.',
      avatar: 'https://api.dicebear.com/7.x/avataaars/svg?seed=lisa&backgroundColor=e0f4b6',
      rating: 4.7,
      reviews: 201
    },
    {
      name: 'Dr. Arun Kumar',
      email: 'arun@clinic.com',
      specialty: 'Psychiatry',
      qualification: 'MD Psychiatry',
      experience: 13,
      fee: 1100,
      bio: 'Dr. Arun Kumar is a compassionate psychiatrist who specializes in mood disorders, anxiety, PTSD, and addiction medicine. He combines medication management with therapeutic approaches.',
      avatar: 'https://api.dicebear.com/7.x/avataaars/svg?seed=arun&backgroundColor=b6e3f4',
      rating: 4.8,
      reviews: 145
    }
  ];

  const insertDoctorTransaction = db.transaction(() => {
    for (const doc of doctors) {
      insertDoctor.run(
        doc.name, doc.email, hashedPassword, doc.specialty, doc.qualification,
        doc.experience, doc.fee, doc.bio, doc.avatar, doc.rating, doc.reviews
      );
    }
  });
  insertDoctorTransaction();

  // Insert time slots for each doctor
  const insertSlot = db.prepare(`
    INSERT INTO time_slots (doctor_id, day_of_week, start_time, end_time)
    VALUES (?, ?, ?, ?)
  `);

  const days = ['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];
  const slotSets = [
    { start: '09:00', end: '09:30' },
    { start: '09:30', end: '10:00' },
    { start: '10:00', end: '10:30' },
    { start: '10:30', end: '11:00' },
    { start: '11:00', end: '11:30' },
    { start: '11:30', end: '12:00' },
    { start: '14:00', end: '14:30' },
    { start: '14:30', end: '15:00' },
    { start: '15:00', end: '15:30' },
    { start: '15:30', end: '16:00' },
    { start: '16:00', end: '16:30' },
    { start: '16:30', end: '17:00' }
  ];

  const insertSlotTransaction = db.transaction(() => {
    const allDoctors = db.prepare('SELECT id FROM doctors').all();
    for (const doctor of allDoctors) {
      for (const day of days) {
        for (const slot of slotSets) {
          insertSlot.run(doctor.id, day, slot.start, slot.end);
        }
      }
    }
  });
  insertSlotTransaction();

  // Insert sample patients
  const insertPatient = db.prepare(`
    INSERT INTO patients (name, email, password, phone, date_of_birth, gender, blood_group, address)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?)
  `);

  const patients = [
    { name: 'John Doe', email: 'john@patient.com', phone: '+1-555-0101', dob: '1990-05-15', gender: 'Male', blood: 'O+', address: '123 Main St, New York, NY' },
    { name: 'Jane Smith', email: 'jane@patient.com', phone: '+1-555-0102', dob: '1988-11-22', gender: 'Female', blood: 'A+', address: '456 Oak Ave, Los Angeles, CA' },
    { name: 'Alex Johnson', email: 'alex@patient.com', phone: '+1-555-0103', dob: '1995-03-08', gender: 'Male', blood: 'B+', address: '789 Pine Rd, Chicago, IL' }
  ];

  const insertPatientTransaction = db.transaction(() => {
    for (const p of patients) {
      insertPatient.run(p.name, p.email, hashedPassword, p.phone, p.dob, p.gender, p.blood, p.address);
    }
  });
  insertPatientTransaction();

  // Insert sample appointments
  const insertAppointment = db.prepare(`
    INSERT INTO appointments (patient_id, doctor_id, appointment_date, start_time, end_time, status, consultation_type, reason)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?)
  `);

  const insertAppointmentTransaction = db.transaction(() => {
    insertAppointment.run(1, 1, '2026-10-16', '09:00', '09:30', 'confirmed', 'in-person', 'Regular heart checkup');
    insertAppointment.run(1, 3, '2026-10-17', '10:00', '10:30', 'pending', 'video', 'Child vaccination schedule');
    insertAppointment.run(2, 2, '2026-10-16', '14:00', '14:30', 'confirmed', 'in-person', 'Skin rash consultation');
    insertAppointment.run(2, 5, '2026-10-18', '11:00', '11:30', 'pending', 'phone', 'Persistent headaches');
    insertAppointment.run(3, 4, '2026-10-16', '15:00', '15:30', 'confirmed', 'in-person', 'Knee pain evaluation');
    insertAppointment.run(3, 6, '2026-10-19', '09:30', '10:00', 'pending', 'video', 'General health checkup');
    insertAppointment.run(1, 6, '2026-10-10', '09:00', '09:30', 'completed', 'in-person', 'Annual physical exam');
    insertAppointment.run(2, 1, '2026-10-09', '10:30', '11:00', 'completed', 'video', 'Follow-up ECG review');
  });
  insertAppointmentTransaction();

  // Insert some notifications
  const insertNotification = db.prepare(`
    INSERT INTO notifications (user_id, user_type, title, message, type)
    VALUES (?, ?, ?, ?, ?)
  `);

  const insertNotifTransaction = db.transaction(() => {
    insertNotification.run(1, 'patient', 'Appointment Confirmed', 'Your appointment with Dr. Sarah Mitchell on Oct 16 at 9:00 AM has been confirmed.', 'success');
    insertNotification.run(1, 'patient', 'Upcoming Appointment', 'Reminder: You have an appointment with Dr. Priya Sharma tomorrow at 10:00 AM.', 'info');
    insertNotification.run(1, 'doctor', 'New Appointment', 'New appointment request from John Doe for Oct 16 at 9:00 AM.', 'info');
    insertNotification.run(2, 'doctor', 'New Appointment', 'New appointment request from Jane Smith for Oct 16 at 2:00 PM.', 'info');
  });
  insertNotifTransaction();

  console.log('Database seeded successfully!');
  console.log('  - 8 doctors added');
  console.log('  - 3 patients added');
  console.log('  - Time slots created for all doctors');
  console.log('  - 8 sample appointments added');
  console.log('  - Sample notifications added');
  console.log('');
  console.log('Login credentials:');
  console.log('  Patient: john@patient.com / password123');
  console.log('  Doctor:  sarah@clinic.com / password123');
}

seed();

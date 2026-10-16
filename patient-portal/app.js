/* ========================================
   MediBook Patient Portal — Application Logic
   ======================================== */

const API_BASE = 'https://ai-doc-pdl-project-server.vercel.app/api';

// State
let state = {
  token: localStorage.getItem('patient_token'),
  user: JSON.parse(localStorage.getItem('patient_user') || 'null'),
  currentPage: 'dashboard',
  doctors: [],
  appointments: [],
  notifications: [],
  selectedDoctor: null,
  selectedSlot: null,
  selectedDate: null
};

// ========================================
// Initialization
// ========================================

document.addEventListener('DOMContentLoaded', () => {
  if (state.token && state.user) {
    showMainApp();
  } else {
    showAuthScreen();
  }
});

function showAuthScreen() {
  document.getElementById('auth-screen').classList.add('active');
  document.getElementById('main-app').classList.remove('active');
}

function showMainApp() {
  document.getElementById('auth-screen').classList.remove('active');
  document.getElementById('main-app').classList.add('active');
  updateUserUI();
  loadDashboard();
  loadNotifications();
  loadSpecialties();
}

function updateUserUI() {
  if (!state.user) return;
  const initials = state.user.name.split(' ').map(n => n[0]).join('').toUpperCase();
  document.getElementById('user-avatar').textContent = initials;
  document.getElementById('user-name').textContent = state.user.name;

  const hour = new Date().getHours();
  let greeting = hour < 12 ? 'Good Morning' : hour < 17 ? 'Good Afternoon' : 'Good Evening';
  document.getElementById('greeting').textContent = `${greeting}, ${state.user.name.split(' ')[0]}!`;
}

// ========================================
// Auth
// ========================================

function switchAuthTab(tab) {
  document.querySelectorAll('.auth-tab').forEach(t => t.classList.remove('active'));
  document.querySelectorAll('.auth-form').forEach(f => f.classList.remove('active'));
  document.querySelector(`[data-tab="${tab}"]`).classList.add('active');
  document.getElementById(`${tab}-form`).classList.add('active');
}

async function handleLogin(e) {
  e.preventDefault();
  const btn = document.getElementById('login-btn');
  btn.disabled = true;
  btn.innerHTML = '<span class="spinner" style="width:20px;height:20px;border-width:2px"></span>';

  try {
    const res = await fetch(`${API_BASE}/patients/login`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        email: document.getElementById('login-email').value,
        password: document.getElementById('login-password').value
      })
    });

    const data = await res.json();
    if (!res.ok) throw new Error(data.error);

    state.token = data.token;
    state.user = data.user;
    localStorage.setItem('patient_token', data.token);
    localStorage.setItem('patient_user', JSON.stringify(data.user));

    showToast('Welcome back, ' + data.user.name + '!', 'success');
    showMainApp();
  } catch (err) {
    showToast(err.message, 'error');
  } finally {
    btn.disabled = false;
    btn.innerHTML = '<span>Sign In</span><span class="material-icons-round">arrow_forward</span>';
  }
}

async function handleRegister(e) {
  e.preventDefault();
  const btn = document.getElementById('register-btn');
  btn.disabled = true;
  btn.innerHTML = '<span class="spinner" style="width:20px;height:20px;border-width:2px"></span>';

  try {
    const res = await fetch(`${API_BASE}/patients/register`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        name: document.getElementById('register-name').value,
        email: document.getElementById('register-email').value,
        password: document.getElementById('register-password').value,
        phone: document.getElementById('register-phone').value,
        gender: document.getElementById('register-gender').value,
        date_of_birth: document.getElementById('register-dob').value
      })
    });

    const data = await res.json();
    if (!res.ok) throw new Error(data.error);

    state.token = data.token;
    state.user = data.user;
    localStorage.setItem('patient_token', data.token);
    localStorage.setItem('patient_user', JSON.stringify(data.user));

    showToast('Account created! Welcome to MediBook.', 'success');
    showMainApp();
  } catch (err) {
    showToast(err.message, 'error');
  } finally {
    btn.disabled = false;
    btn.innerHTML = '<span>Create Account</span><span class="material-icons-round">arrow_forward</span>';
  }
}

function logout() {
  state.token = null;
  state.user = null;
  localStorage.removeItem('patient_token');
  localStorage.removeItem('patient_user');
  showAuthScreen();
  showToast('Signed out successfully', 'info');
}

// ========================================
// API Helpers
// ========================================

async function apiFetch(url, options = {}) {
  const headers = { 'Content-Type': 'application/json', ...options.headers };
  if (state.token) headers['Authorization'] = `Bearer ${state.token}`;

  const res = await fetch(`${API_BASE}${url}`, { ...options, headers });
  const data = await res.json();

  if (res.status === 401 || res.status === 403) {
    logout();
    throw new Error('Session expired. Please log in again.');
  }

  if (!res.ok) throw new Error(data.error || 'Something went wrong');
  return data;
}

// ========================================
// Navigation
// ========================================

function navigateTo(page) {
  state.currentPage = page;
  document.querySelectorAll('.page').forEach(p => p.classList.remove('active'));
  document.querySelectorAll('.nav-item').forEach(n => n.classList.remove('active'));

  document.getElementById(`page-${page}`).classList.add('active');
  document.querySelector(`[data-page="${page}"]`).classList.add('active');

  // Close sidebar on mobile
  document.getElementById('sidebar').classList.remove('open');

  // Load page data
  switch (page) {
    case 'dashboard': loadDashboard(); break;
    case 'ai-triage': initAITriagePage(); break;
    case 'doctors': loadDoctors(); break;
    case 'appointments': loadAppointments(); break;
    case 'profile': loadProfile(); break;
  }
}

function toggleSidebar() {
  document.getElementById('sidebar').classList.toggle('open');
}

function handleGlobalSearch(e) {
  if (e.key === 'Enter') {
    const query = e.target.value.trim();
    if (query) {
      navigateTo('doctors');
      document.getElementById('filter-search').value = query;
      filterDoctors();
    }
  }
}

// ========================================
// Dashboard
// ========================================

async function loadDashboard() {
  try {
    const data = await apiFetch('/dashboard/patient');

    // Stats
    document.getElementById('stat-total').textContent = data.stats.total || 0;
    document.getElementById('stat-confirmed').textContent = data.stats.confirmed || 0;
    document.getElementById('stat-pending').textContent = data.stats.pending || 0;
    document.getElementById('stat-completed').textContent = data.stats.completed || 0;

    // Upcoming appointments
    const upcomingEl = document.getElementById('upcoming-list');
    if (data.upcoming_appointments.length === 0) {
      upcomingEl.innerHTML = `
        <div class="empty-state">
          <span class="material-icons-round">event_available</span>
          <h3>No Upcoming Appointments</h3>
          <p>Book an appointment with a doctor to get started</p>
        </div>
      `;
    } else {
      upcomingEl.innerHTML = data.upcoming_appointments.map(apt => {
        const date = new Date(apt.appointment_date + 'T00:00:00');
        const months = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
        return `
          <div class="upcoming-item">
            <div class="upcoming-date">
              <span class="day">${date.getDate()}</span>
              <span class="month">${months[date.getMonth()]}</span>
            </div>
            <div class="upcoming-info">
              <h4>${apt.doctor_name}</h4>
              <p>${apt.doctor_specialty}</p>
              <div class="upcoming-meta">
                <span><span class="material-icons-round">schedule</span> ${formatTime(apt.start_time)}</span>
                <span><span class="material-icons-round">videocam</span> ${apt.consultation_type}</span>
              </div>
            </div>
            <span class="status-badge status-${apt.status}">${apt.status}</span>
          </div>
        `;
      }).join('');
    }

    // Recent doctors
    const recentEl = document.getElementById('recent-doctors-list');
    if (data.recent_doctors.length === 0) {
      recentEl.innerHTML = `
        <div class="empty-state">
          <span class="material-icons-round">medical_services</span>
          <h3>No Recent Visits</h3>
          <p>Your recent doctor visits will appear here</p>
        </div>
      `;
    } else {
      recentEl.innerHTML = data.recent_doctors.map(doc => `
        <div class="recent-doctor-item" onclick="viewDoctor(${doc.id})">
          <img src="${doc.avatar_url || ''}" alt="${doc.name}" class="doctor-avatar-sm" onerror="this.style.display='none'">
          <div class="recent-doctor-info">
            <h4>${doc.name}</h4>
            <p>${doc.specialty} • Last visit: ${formatDate(doc.last_visit)}</p>
          </div>
        </div>
      `).join('');
    }
  } catch (err) {
    showToast('Failed to load dashboard: ' + err.message, 'error');
  }
}

// ========================================
// Doctors
// ========================================

async function loadSpecialties() {
  try {
    const specialties = await apiFetch('/doctors/specialties');
    const select = document.getElementById('filter-specialty');
    select.innerHTML = '<option value="">All Specialties</option>' +
      specialties.map(s => `<option value="${s}">${s}</option>`).join('');
  } catch (err) {
    console.error('Failed to load specialties:', err);
  }
}

async function loadDoctors() {
  try {
    const params = new URLSearchParams();
    const specialty = document.getElementById('filter-specialty').value;
    const sort = document.getElementById('filter-sort').value;
    const search = document.getElementById('filter-search').value;

    if (specialty) params.set('specialty', specialty);
    if (sort) params.set('sort', sort);
    if (search) params.set('search', search);

    state.doctors = await apiFetch(`/doctors?${params}`);
    renderDoctors();
  } catch (err) {
    showToast('Failed to load doctors: ' + err.message, 'error');
  }
}

function filterDoctors() {
  loadDoctors();
}

function renderDoctors() {
  const grid = document.getElementById('doctors-grid');

  if (state.doctors.length === 0) {
    grid.innerHTML = `
      <div class="empty-state" style="grid-column: 1 / -1">
        <span class="material-icons-round">search_off</span>
        <h3>No Doctors Found</h3>
        <p>Try adjusting your filters or search query</p>
      </div>
    `;
    return;
  }

  grid.innerHTML = state.doctors.map(doc => `
    <div class="doctor-card" onclick="viewDoctor(${doc.id})">
      <div class="doctor-card-header">
        <img src="${doc.avatar_url || ''}" alt="${doc.name}" class="doctor-avatar" onerror="this.style.display='none'">
        <div class="doctor-card-info">
          <h3>${doc.name}</h3>
          <span class="doctor-card-specialty">${doc.specialty}</span>
          <div class="doctor-card-qualification">${doc.qualification}</div>
        </div>
      </div>
      <div class="doctor-card-body">
        <div class="doctor-card-stats">
          <div class="doctor-stat rating">
            <span class="material-icons-round">star</span>
            <span>${doc.rating} (${doc.total_reviews})</span>
          </div>
          <div class="doctor-stat experience">
            <span class="material-icons-round">work_history</span>
            <span>${doc.experience_years} yrs</span>
          </div>
        </div>
      </div>
      <div class="doctor-card-footer">
        <div class="doctor-fee">
          <span class="amount">₹${doc.consultation_fee}</span>
          <span class="label">Consultation Fee</span>
        </div>
        <button class="btn btn-primary btn-sm" onclick="event.stopPropagation(); openBooking(${doc.id})">
          <span class="material-icons-round">event</span>
          Book Now
        </button>
      </div>
    </div>
  `).join('');
}

async function viewDoctor(id) {
  try {
    const doctor = await apiFetch(`/doctors/${id}`);
    state.selectedDoctor = doctor;

    const body = document.getElementById('doctor-modal-body');
    body.innerHTML = `
      <div class="doctor-detail-header">
        <img src="${doctor.avatar_url || ''}" alt="${doctor.name}" style="width:80px;height:80px;border-radius:16px;object-fit:cover" onerror="this.style.display='none'">
        <div>
          <h2 class="doctor-detail-name">${doctor.name}</h2>
          <span class="doctor-card-specialty">${doctor.specialty}</span>
          <div style="margin-top:4px;color:var(--text-secondary);font-size:0.9rem">${doctor.qualification}</div>
        </div>
      </div>

      <div class="doctor-detail-stats">
        <div class="detail-stat">
          <div class="value">${doctor.rating}</div>
          <div class="label">Rating</div>
        </div>
        <div class="detail-stat">
          <div class="value">${doctor.total_reviews}</div>
          <div class="label">Reviews</div>
        </div>
        <div class="detail-stat">
          <div class="value">${doctor.experience_years}yr</div>
          <div class="label">Experience</div>
        </div>
        <div class="detail-stat">
          <div class="value">₹${doctor.consultation_fee}</div>
          <div class="label">Fee</div>
        </div>
      </div>

      <p class="doctor-bio">${doctor.bio || 'No bio available.'}</p>

      <button class="btn btn-primary btn-full" onclick="closeModal('doctor-modal'); openBooking(${doctor.id})" style="margin-bottom:var(--space-lg)">
        <span class="material-icons-round">event</span>
        Book Appointment
      </button>

      ${doctor.reviews && doctor.reviews.length > 0 ? `
        <div class="reviews-section">
          <h3>Patient Reviews</h3>
          ${doctor.reviews.map(r => `
            <div class="review-item">
              <div class="review-header">
                <span class="review-author">${r.patient_name}</span>
                <span class="review-rating">${'★'.repeat(r.rating)}${'☆'.repeat(5 - r.rating)}</span>
              </div>
              ${r.comment ? `<p class="review-comment">${r.comment}</p>` : ''}
            </div>
          `).join('')}
        </div>
      ` : '<p style="color:var(--text-tertiary);text-align:center">No reviews yet</p>'}
    `;

    openModal('doctor-modal');
  } catch (err) {
    showToast('Failed to load doctor details: ' + err.message, 'error');
  }
}

// ========================================
// Booking
// ========================================

async function openBooking(doctorId, prefilledTriage = null) {
  state.attachedTriage = prefilledTriage;
  const doctor = state.doctors.find(d => d.id === doctorId) || await apiFetch(`/doctors/${doctorId}`);
  state.selectedDoctor = doctor;
  state.selectedSlot = null;
  state.selectedDate = null;

  // Get tomorrow's date as minimum
  const tomorrow = new Date();
  tomorrow.setDate(tomorrow.getDate() + 1);
  const minDate = tomorrow.toISOString().split('T')[0];

  const defaultReason = state.attachedTriage
    ? `Recognized Condition: ${state.attachedTriage.condition_name}. Symptoms: ${(state.attachedTriage.symptoms || []).join(', ')}`
    : '';

  const body = document.getElementById('booking-modal-body');
  body.innerHTML = `
    <div class="booking-doctor-info">
      <img src="${doctor.avatar_url || ''}" alt="${doctor.name}" style="width:56px;height:56px;border-radius:12px;object-fit:cover" onerror="this.style.display='none'">
      <div class="booking-doctor-details">
        <h3>${doctor.name}</h3>
        <p>${doctor.specialty} • ${doctor.qualification}</p>
        <div class="booking-fee">₹${doctor.consultation_fee}</div>
      </div>
    </div>

    ${state.attachedTriage ? `
      <div class="booking-ai-tag">
        <span class="material-icons-round" style="color:var(--primary-light);font-size:1.5rem">psychology</span>
        <div style="flex:1">
          <strong style="color:var(--text-primary)">Gemini AI Diagnosis Attached:</strong>
          <span style="font-weight:600;color:var(--primary-light)">${escapeHtml(state.attachedTriage.condition_name)}</span>
          <span class="urgency-pill urgency-${state.attachedTriage.urgency_level || 'moderate'}">${(state.attachedTriage.urgency_level || 'moderate').toUpperCase()}</span>
          <p style="font-size:0.75rem;color:var(--text-secondary);margin-top:2px">The doctor will receive and review this clinical condition assessment during your consultation.</p>
        </div>
        <button type="button" class="btn-text" onclick="detachAITriage()" style="color:var(--text-tertiary);font-size:0.75rem">Detach</button>
      </div>
    ` : ''}

    <form class="booking-form" onsubmit="submitBooking(event)">
      <div class="form-group">
        <label>Appointment Date</label>
        <input type="date" id="booking-date" min="${minDate}" required onchange="loadSlots(${doctor.id}, this.value)">
      </div>

      <div class="form-group">
        <label>Available Time Slots</label>
        <div id="slots-container">
          <div class="no-slots">
            <span class="material-icons-round">calendar_today</span>
            <p>Select a date to view available slots</p>
          </div>
        </div>
      </div>

      <div class="form-group">
        <label>Consultation Type</label>
        <select id="booking-type" required>
          <option value="in-person">In-Person Visit</option>
          <option value="video">Video Call (Teleconsultation)</option>
          <option value="phone">Phone Call</option>
        </select>
      </div>

      <div class="form-group">
        <label>Reason for Visit / Condition Description</label>
        <textarea id="booking-reason" placeholder="Describe your symptoms or reason for consultation..." rows="3">${escapeHtml(defaultReason)}</textarea>
      </div>

      <button type="submit" class="btn btn-primary btn-full" id="booking-submit-btn">
        <span class="material-icons-round">check_circle</span>
        Confirm Booking
      </button>
    </form>
  `;

  openModal('booking-modal');
}

function detachAITriage() {
  state.attachedTriage = null;
  const tag = document.querySelector('.booking-ai-tag');
  if (tag) tag.remove();
}

async function loadSlots(doctorId, date) {
  const container = document.getElementById('slots-container');
  container.innerHTML = '<div class="loading-spinner"><div class="spinner"></div></div>';
  state.selectedSlot = null;
  state.selectedDate = date;

  try {
    const slots = await apiFetch(`/doctors/${doctorId}/slots?date=${date}`);

    if (slots.length === 0) {
      container.innerHTML = `
        <div class="no-slots">
          <span class="material-icons-round">event_busy</span>
          <p>No available slots for this date. Try another date.</p>
        </div>
      `;
      return;
    }

    // Group by time period
    const morning = slots.filter(s => parseInt(s.start_time) < 12);
    const afternoon = slots.filter(s => parseInt(s.start_time) >= 12);

    let html = '';
    if (morning.length > 0) {
      html += '<p style="font-size:0.85rem;color:var(--text-secondary);margin:8px 0 4px">🌅 Morning</p>';
      html += '<div class="slots-grid">';
      html += morning.map(s => `
        <button type="button" class="slot-btn ${s.is_booked ? 'booked' : ''}"
          onclick="${s.is_booked ? '' : `selectSlot(this, '${s.start_time}', '${s.end_time}')`}"
          ${s.is_booked ? 'disabled' : ''}>
          ${formatTime(s.start_time)}
        </button>
      `).join('');
      html += '</div>';
    }

    if (afternoon.length > 0) {
      html += '<p style="font-size:0.85rem;color:var(--text-secondary);margin:12px 0 4px">🌇 Afternoon</p>';
      html += '<div class="slots-grid">';
      html += afternoon.map(s => `
        <button type="button" class="slot-btn ${s.is_booked ? 'booked' : ''}"
          onclick="${s.is_booked ? '' : `selectSlot(this, '${s.start_time}', '${s.end_time}')`}"
          ${s.is_booked ? 'disabled' : ''}>
          ${formatTime(s.start_time)}
        </button>
      `).join('');
      html += '</div>';
    }

    container.innerHTML = html;
  } catch (err) {
    container.innerHTML = `<p style="color:var(--error);text-align:center">Failed to load slots</p>`;
  }
}

function selectSlot(btn, startTime, endTime) {
  document.querySelectorAll('.slot-btn').forEach(b => b.classList.remove('selected'));
  btn.classList.add('selected');
  state.selectedSlot = { start_time: startTime, end_time: endTime };
}

async function submitBooking(e) {
  e.preventDefault();

  if (!state.selectedSlot) {
    showToast('Please select a time slot', 'warning');
    return;
  }

  const btn = document.getElementById('booking-submit-btn');
  btn.disabled = true;
  btn.innerHTML = '<span class="spinner" style="width:20px;height:20px;border-width:2px"></span><span>Booking...</span>';

  try {
    const payload = {
      doctor_id: state.selectedDoctor.id,
      appointment_date: state.selectedDate,
      start_time: state.selectedSlot.start_time,
      end_time: state.selectedSlot.end_time,
      consultation_type: document.getElementById('booking-type').value,
      reason: document.getElementById('booking-reason').value
    };

    if (state.attachedTriage) {
      payload.patient_condition = state.attachedTriage.condition_name || '';
      payload.ai_diagnosis = state.attachedTriage;
      payload.urgency_level = state.attachedTriage.urgency_level || 'moderate';
      payload.symptoms = state.attachedTriage.symptoms || [];
    }

    await apiFetch('/appointments', {
      method: 'POST',
      body: JSON.stringify(payload)
    });

    state.attachedTriage = null;

    showToast('Appointment booked successfully! Condition report shared with doctor.', 'success');
    closeModal('booking-modal');

    // Refresh current page
    if (state.currentPage === 'dashboard') loadDashboard();
    if (state.currentPage === 'appointments') loadAppointments();
  } catch (err) {
    showToast(err.message, 'error');
  } finally {
    btn.disabled = false;
    btn.innerHTML = '<span class="material-icons-round">check_circle</span>Confirm Booking';
  }
}

// ========================================
// Appointments
// ========================================

async function loadAppointments(statusFilter) {
  try {
    const params = statusFilter && statusFilter !== 'all' ? `?status=${statusFilter}` : '';
    state.appointments = await apiFetch(`/appointments/patient${params}`);
    renderAppointments();
  } catch (err) {
    showToast('Failed to load appointments: ' + err.message, 'error');
  }
}

function filterAppointments(status) {
  document.querySelectorAll('.apt-tab').forEach(t => t.classList.remove('active'));
  event.target.classList.add('active');
  loadAppointments(status);
}

function renderAppointments() {
  const list = document.getElementById('appointments-list');

  if (state.appointments.length === 0) {
    list.innerHTML = `
      <div class="empty-state">
        <span class="material-icons-round">event_note</span>
        <h3>No Appointments Found</h3>
        <p>You don't have any appointments matching this filter</p>
        <button class="btn btn-primary" onclick="navigateTo('doctors')" style="margin-top:16px">
          <span class="material-icons-round">search</span>
          Find a Doctor
        </button>
      </div>
    `;
    return;
  }

  list.innerHTML = state.appointments.map(apt => {
    const date = new Date(apt.appointment_date + 'T00:00:00');
    const months = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];

    const canCancel = ['pending', 'confirmed'].includes(apt.status);
    const canReview = apt.status === 'completed';

    return `
      <div class="appointment-card">
        <div class="apt-date-badge">
          <span class="day">${date.getDate()}</span>
          <span class="month">${months[date.getMonth()]}</span>
          <span class="year">${date.getFullYear()}</span>
        </div>
        <div class="apt-info">
          <h3>${apt.doctor_name}</h3>
          <span class="doctor-card-specialty" style="margin-bottom:4px">${apt.doctor_specialty}</span>
          ${apt.reason ? `<p class="apt-reason">"${escapeHtml(apt.reason)}"</p>` : ''}
          ${apt.prescription ? `
            <div style="background:rgba(99,102,241,0.08);padding:8px 12px;border-left:3px solid var(--primary);border-radius:4px;font-size:0.85rem;margin-top:6px">
              <strong>Rx Prescription:</strong> ${escapeHtml(apt.prescription)}
            </div>
          ` : ''}
          ${apt.notes ? `
            <div style="background:rgba(6,182,212,0.08);padding:8px 12px;border-left:3px solid var(--accent);border-radius:4px;font-size:0.85rem;margin-top:6px">
              <strong>Doctor Advice:</strong> ${escapeHtml(apt.notes)}
            </div>
          ` : ''}
          <div class="apt-info-row" style="margin-top:8px">
            <span class="apt-detail">
              <span class="material-icons-round">schedule</span>
              ${formatTime(apt.start_time)} - ${formatTime(apt.end_time)}
            </span>
            <span class="apt-detail">
              <span class="material-icons-round">${apt.consultation_type === 'video' ? 'videocam' : apt.consultation_type === 'phone' ? 'phone' : 'location_on'}</span>
              ${apt.consultation_type}
            </span>
            <span class="status-badge status-${apt.status}">${apt.status}</span>
          </div>
        </div>
        <div class="apt-actions">
          ${apt.status === 'confirmed' && apt.consultation_type === 'video' ? `
            <button class="btn btn-success btn-sm" onclick="startVideoCall(${apt.id}, 'patient')">
              <span class="material-icons-round">videocam</span> Join Call
            </button>
          ` : ''}
          ${apt.prescription ? `
            <button class="btn btn-secondary btn-sm" onclick="printPrescription(${apt.id})">
              <span class="material-icons-round">print</span> Print Rx
            </button>
          ` : ''}
          ${canCancel ? `<button class="btn btn-danger btn-sm" onclick="cancelAppointment(${apt.id})">
            <span class="material-icons-round">close</span> Cancel
          </button>` : ''}
          ${canReview ? `<button class="btn btn-primary btn-sm" onclick="openReviewModal(${apt.id})">
            <span class="material-icons-round">rate_review</span> Review
          </button>` : ''}
        </div>
      </div>
    `;
  }).join('');
}

async function cancelAppointment(id) {
  if (!confirm('Are you sure you want to cancel this appointment?')) return;

  try {
    await apiFetch(`/appointments/${id}/cancel`, { method: 'PUT' });
    showToast('Appointment cancelled', 'success');
    loadAppointments();
    if (state.currentPage === 'dashboard') loadDashboard();
  } catch (err) {
    showToast(err.message, 'error');
  }
}

function openReviewModal(appointmentId) {
  const body = document.getElementById('booking-modal-body');
  body.innerHTML = `
    <h3 style="margin-bottom:var(--space-lg)">Rate Your Experience</h3>
    <form class="booking-form" onsubmit="submitReview(event, ${appointmentId})">
      <div class="form-group">
        <label>Rating</label>
        <div class="slots-grid" style="grid-template-columns: repeat(5, 1fr)">
          ${[1,2,3,4,5].map(n => `
            <button type="button" class="slot-btn" onclick="selectRating(this, ${n})" data-rating="${n}">
              ${'★'.repeat(n)}
            </button>
          `).join('')}
        </div>
        <input type="hidden" id="review-rating" value="">
      </div>
      <div class="form-group">
        <label>Comment (Optional)</label>
        <textarea id="review-comment" placeholder="Share your experience..." rows="3"></textarea>
      </div>
      <button type="submit" class="btn btn-primary btn-full">
        <span class="material-icons-round">send</span>
        Submit Review
      </button>
    </form>
  `;

  document.getElementById('booking-modal').querySelector('.modal-header h2').textContent = 'Write a Review';
  openModal('booking-modal');
}

function selectRating(btn, rating) {
  document.querySelectorAll('[data-rating]').forEach(b => b.classList.remove('selected'));
  btn.classList.add('selected');
  document.getElementById('review-rating').value = rating;
}

async function submitReview(e, appointmentId) {
  e.preventDefault();
  const rating = document.getElementById('review-rating').value;
  if (!rating) {
    showToast('Please select a rating', 'warning');
    return;
  }

  try {
    await apiFetch(`/appointments/${appointmentId}/review`, {
      method: 'POST',
      body: JSON.stringify({
        rating: parseInt(rating),
        comment: document.getElementById('review-comment').value
      })
    });

    showToast('Review submitted. Thank you!', 'success');
    closeModal('booking-modal');
  } catch (err) {
    showToast(err.message, 'error');
  }
}

// ========================================
// Profile
// ========================================

async function loadProfile() {
  try {
    const profile = await apiFetch('/patients/profile');
    state.user = { ...state.user, ...profile };

    const initials = profile.name.split(' ').map(n => n[0]).join('').toUpperCase();
    document.getElementById('profile-avatar-large').textContent = initials;
    document.getElementById('profile-name').textContent = profile.name;
    document.getElementById('profile-email').textContent = profile.email;

    document.getElementById('profile-edit-name').value = profile.name || '';
    document.getElementById('profile-edit-phone').value = profile.phone || '';
    document.getElementById('profile-edit-gender').value = profile.gender || '';
    document.getElementById('profile-edit-dob').value = profile.date_of_birth || '';
    document.getElementById('profile-edit-blood').value = profile.blood_group || '';
    document.getElementById('profile-edit-address').value = profile.address || '';
  } catch (err) {
    showToast('Failed to load profile: ' + err.message, 'error');
  }
}

async function updateProfile(e) {
  e.preventDefault();

  try {
    const data = await apiFetch('/patients/profile', {
      method: 'PUT',
      body: JSON.stringify({
        name: document.getElementById('profile-edit-name').value,
        phone: document.getElementById('profile-edit-phone').value,
        gender: document.getElementById('profile-edit-gender').value,
        date_of_birth: document.getElementById('profile-edit-dob').value,
        blood_group: document.getElementById('profile-edit-blood').value,
        address: document.getElementById('profile-edit-address').value
      })
    });

    state.user = { ...state.user, ...data.user };
    localStorage.setItem('patient_user', JSON.stringify(state.user));
    updateUserUI();
    showToast('Profile updated successfully', 'success');
  } catch (err) {
    showToast(err.message, 'error');
  }
}

// ========================================
// Notifications
// ========================================

async function loadNotifications() {
  try {
    const data = await apiFetch('/notifications');
    state.notifications = data.notifications;

    const badge = document.getElementById('notif-badge');
    if (data.unread_count > 0) {
      badge.style.display = 'flex';
      badge.textContent = data.unread_count;
    } else {
      badge.style.display = 'none';
    }

    renderNotifications();
  } catch (err) {
    console.error('Failed to load notifications:', err);
  }
}

function renderNotifications() {
  const list = document.getElementById('notif-list');

  if (state.notifications.length === 0) {
    list.innerHTML = `
      <div class="notif-empty">
        <span class="material-icons-round">notifications_none</span>
        <p>No notifications yet</p>
      </div>
    `;
    return;
  }

  const icons = { info: 'info', success: 'check_circle', warning: 'warning', error: 'error' };

  list.innerHTML = state.notifications.map(n => `
    <div class="notif-item ${n.is_read ? '' : 'unread'}" onclick="markNotifRead(${n.id})">
      <div class="notif-icon ${n.type}">
        <span class="material-icons-round">${icons[n.type] || 'info'}</span>
      </div>
      <div class="notif-content">
        <h4>${n.title}</h4>
        <p>${n.message}</p>
        <span class="notif-time">${formatDateTime(n.created_at)}</span>
      </div>
    </div>
  `).join('');
}

function toggleNotifications() {
  const panel = document.getElementById('notification-panel');
  panel.classList.toggle('active');
}

async function markNotifRead(id) {
  try {
    await apiFetch(`/notifications/${id}/read`, { method: 'PUT' });
    loadNotifications();
  } catch (err) {
    console.error(err);
  }
}

async function markAllRead() {
  try {
    await apiFetch('/notifications/read-all', { method: 'PUT' });
    loadNotifications();
    showToast('All notifications marked as read', 'info');
  } catch (err) {
    console.error(err);
  }
}

// Close notification panel when clicking outside
document.addEventListener('click', (e) => {
  const panel = document.getElementById('notification-panel');
  const btn = document.getElementById('notif-btn');
  if (panel && !panel.contains(e.target) && !btn.contains(e.target)) {
    panel.classList.remove('active');
  }
});

// ========================================
// Modals
// ========================================

function openModal(id) {
  document.getElementById(id).classList.add('active');
  document.body.style.overflow = 'hidden';
}

function closeModal(id) {
  document.getElementById(id).classList.remove('active');
  document.body.style.overflow = '';
}

// Close modal on overlay click
document.querySelectorAll('.modal-overlay').forEach(overlay => {
  overlay.addEventListener('click', (e) => {
    if (e.target === overlay) {
      overlay.classList.remove('active');
      document.body.style.overflow = '';
    }
  });
});

// ========================================
// Toast
// ========================================

function showToast(message, type = 'info') {
  const container = document.getElementById('toast-container');
  const icons = { success: 'check_circle', error: 'error', warning: 'warning', info: 'info' };

  const toast = document.createElement('div');
  toast.className = `toast toast-${type}`;
  toast.innerHTML = `
    <span class="material-icons-round toast-icon">${icons[type]}</span>
    <span class="toast-message">${message}</span>
    <button class="toast-close" onclick="this.parentElement.remove()">
      <span class="material-icons-round" style="font-size:1rem">close</span>
    </button>
  `;

  container.appendChild(toast);
  setTimeout(() => toast.remove(), 5000);
}

// ========================================
// Utility Functions
// ========================================

function formatTime(timeStr) {
  if (!timeStr) return '';
  const [h, m] = timeStr.split(':');
  const hour = parseInt(h);
  const ampm = hour >= 12 ? 'PM' : 'AM';
  const h12 = hour % 12 || 12;
  return `${h12}:${m} ${ampm}`;
}

function formatDate(dateStr) {
  if (!dateStr) return '';
  const date = new Date(dateStr + 'T00:00:00');
  return date.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
}

function formatDateTime(dtStr) {
  if (!dtStr) return '';
  const date = new Date(dtStr);
  const now = new Date();
  const diff = (now - date) / 1000;

  if (diff < 60) return 'Just now';
  if (diff < 3600) return `${Math.floor(diff / 60)}m ago`;
  if (diff < 86400) return `${Math.floor(diff / 3600)}h ago`;
  if (diff < 604800) return `${Math.floor(diff / 86400)}d ago`;
  return date.toLocaleDateString();
}

function toggleUserMenu() {
  // Simple toggle for user menu - could be expanded
}

function escapeHtml(str) {
  if (!str) return '';
  return String(str)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#039;');
}

// ========================================
// Prescription Sheet & Print (Patient Portal)
// ========================================

function printPrescription(appointmentId) {
  const apt = state.appointments.find(a => a.id === appointmentId);
  if (!apt) return;

  const modalBody = document.getElementById('prescription-modal-body');
  if (!modalBody) return;

  const rxDate = formatDate(apt.appointment_date);
  const patient = state.user || {};

  modalBody.innerHTML = `
    <div class="rx-sheet" id="printable-rx-sheet">
      <div class="rx-header">
        <div>
          <div class="rx-clinic-name">
            <span class="material-icons-round" style="color:#6366f1">local_hospital</span>
            MediBook Clinic Network
          </div>
          <p style="font-size:0.85rem;color:#64748b;margin-top:2px">Specialized Medical Care & Consultation Center</p>
        </div>
        <div style="text-align:right">
          <h3 style="font-size:1.1rem;color:#0f172a;margin:0">${escapeHtml(apt.doctor_name || 'Attending Physician')}</h3>
          <p style="font-size:0.8rem;color:#6366f1;font-weight:600">${escapeHtml(apt.doctor_specialty || '')}</p>
          <p style="font-size:0.75rem;color:#64748b">${escapeHtml(apt.doctor_qualification || 'Certified Medical Practitioner')}</p>
        </div>
      </div>

      <div class="rx-meta-grid">
        <div><strong>Patient Name:</strong> ${escapeHtml(patient.name || 'Patient')}</div>
        <div><strong>Date:</strong> ${rxDate}</div>
        <div><strong>Contact:</strong> ${escapeHtml(patient.phone || 'N/A')}</div>
        <div><strong>Blood Group:</strong> ${escapeHtml(patient.blood_group || 'N/A')}</div>
        <div><strong>Consultation:</strong> <span style="text-transform:capitalize">${escapeHtml(apt.consultation_type || 'In-Person')}</span></div>
        <div><strong>Rx Ref ID:</strong> #MED-${apt.id}-${new Date().getFullYear()}</div>
      </div>

      ${apt.reason ? `
        <div style="margin-bottom:var(--space-md);font-size:0.9rem">
          <strong>Chief Medical Complaint:</strong>
          <span style="color:#475569">${escapeHtml(apt.reason)}</span>
        </div>
      ` : ''}

      <div class="rx-symbol-bar">
        <span>&#8478;</span>
        <span style="font-size:0.85rem;color:#64748b;font-weight:500;font-family:var(--font)">Medication & Instructions</span>
      </div>

      <div class="rx-content-box">${escapeHtml(apt.prescription || 'No prescription recorded.')}</div>

      ${apt.notes ? `
        <div style="margin-bottom:var(--space-md)">
          <strong style="font-size:0.9rem">Clinical Advice & Doctor Notes:</strong>
          <p style="font-size:0.88rem;color:#334155;background:#f8fafc;padding:10px;border-radius:4px;border:1px solid #e2e8f0;margin-top:4px">
            ${escapeHtml(apt.notes)}
          </p>
        </div>
      ` : ''}

      <div class="rx-footer">
        <div class="rx-seal">
          <p>✔ Verified MediBook Digital Consultation</p>
          <p>Valid at all certified pharmacies</p>
        </div>
        <div class="rx-signature-box">
          <p style="font-family:'Courier New', monospace;color:#6366f1">${escapeHtml(apt.doctor_name || 'Doctor')}</p>
          <p style="font-size:0.75rem;color:#64748b;border-top:1px solid #cbd5e1;padding-top:2px">Authorized Signature</p>
        </div>
      </div>
    </div>
  `;

  openModal('prescription-modal');
}

function printPrescriptionDoc() {
  window.print();
}

// ========================================
// Virtual Teleconsultation Video Room (Patient Portal)
// ========================================

let callTimerInterval = null;
let callSeconds = 0;
let callMediaStream = null;
let callAudioMuted = false;
let callVideoMuted = false;

function startVideoCall(appointmentId, role = 'patient') {
  const apt = state.appointments.find(a => a.id === appointmentId);
  const peerName = apt ? apt.doctor_name : 'Dr. Sarah Mitchell';
  const myName = state.user ? state.user.name : 'Patient';

  const modalBody = document.getElementById('video-modal-body');
  if (!modalBody) return;

  callSeconds = 0;
  clearInterval(callTimerInterval);
  callTimerInterval = setInterval(() => {
    callSeconds++;
    const mins = String(Math.floor(callSeconds / 60)).padStart(2, '0');
    const secs = String(callSeconds % 60).padStart(2, '0');
    const timerEl = document.getElementById('video-call-timer');
    if (timerEl) timerEl.textContent = `${mins}:${secs}`;
  }, 1000);

  modalBody.innerHTML = `
    <div class="video-room-container">
      <div class="video-grid">
        <!-- Local Stream -->
        <div class="video-stream-card" id="local-video-card">
          <video id="local-video-elem" autoplay playsinline muted style="display:none"></video>
          <div class="video-placeholder" id="local-video-placeholder">
            <div class="video-avatar-pulse">
              <span class="material-icons-round" style="font-size:2.4rem">person</span>
            </div>
            <p style="font-size:0.9rem;font-weight:600">${escapeHtml(myName)} (You)</p>
          </div>
          <div class="video-badge-overlay">
            <span class="video-status-dot"></span>
            <span>You • HD 1080p</span>
          </div>
        </div>

        <!-- Remote Peer Stream -->
        <div class="video-stream-card" id="remote-video-card">
          <div class="video-placeholder">
            <div class="video-avatar-pulse" style="background:linear-gradient(135deg, #6366f1, #06b6d4)">
              <span class="material-icons-round" style="font-size:2.4rem">medical_services</span>
            </div>
            <p style="font-size:0.9rem;font-weight:600">${escapeHtml(peerName)}</p>
            <span style="font-size:0.75rem;color:#10b981">● Connected via Secure WebRTC</span>
          </div>
          <div class="video-badge-overlay">
            <span class="video-status-dot"></span>
            <span>${escapeHtml(peerName)}</span>
          </div>
        </div>
      </div>

      <!-- Controls Bar -->
      <div class="video-controls-bar">
        <button class="control-btn" id="btn-toggle-mic" onclick="toggleCallAudio()" title="Toggle Microphone">
          <span class="material-icons-round">mic</span>
        </button>
        <button class="control-btn" id="btn-toggle-cam" onclick="toggleCallVideo()" title="Toggle Camera">
          <span class="material-icons-round">videocam</span>
        </button>
        <button class="control-btn" onclick="toggleScreenShare()" title="Share Screen">
          <span class="material-icons-round">screen_share</span>
        </button>
        <button class="control-btn btn-hangup" onclick="endVideoCall()" title="Leave Consultation">
          <span class="material-icons-round">call_end</span>
        </button>
      </div>

      <!-- In-Call Messaging Drawer -->
      <div class="incall-chat-box">
        <div style="font-size:0.85rem;font-weight:600;margin-bottom:8px;color:var(--text-secondary)">
          In-Call Consultation Chat
        </div>
        <div class="incall-msgs" id="incall-msgs">
          <div class="incall-msg peer">
            <strong>System:</strong> Secure encrypted video consultation connected.
          </div>
          <div class="incall-msg peer">
            <strong>${escapeHtml(peerName)}:</strong> Hello! Dr. Mitchell is here. What symptoms are you experiencing today?
          </div>
        </div>
        <div style="display:flex;gap:var(--space-sm)">
          <input type="text" id="incall-input" placeholder="Type message to doctor..." style="flex:1;padding:8px 12px;background:var(--bg-input);border:1px solid var(--border);border-radius:var(--radius-sm)" onkeypress="if(event.key==='Enter') sendInCallMessage()">
          <button class="btn btn-sm btn-primary" onclick="sendInCallMessage()">Send</button>
        </div>
      </div>
    </div>
  `;

  openModal('video-modal');

  // Attempt local camera stream with fallback
  if (navigator.mediaDevices && navigator.mediaDevices.getUserMedia) {
    navigator.mediaDevices.getUserMedia({ video: true, audio: true })
      .then(stream => {
        callMediaStream = stream;
        const videoEl = document.getElementById('local-video-elem');
        const placeholder = document.getElementById('local-video-placeholder');
        if (videoEl && placeholder) {
          videoEl.srcObject = stream;
          videoEl.style.display = 'block';
          placeholder.style.display = 'none';
        }
      })
      .catch(err => {
        console.log('Camera access info (simulation active):', err.message);
      });
  }
}

function toggleCallAudio() {
  callAudioMuted = !callAudioMuted;
  const btn = document.getElementById('btn-toggle-mic');
  if (btn) {
    btn.classList.toggle('active-off', callAudioMuted);
    btn.innerHTML = `<span class="material-icons-round">${callAudioMuted ? 'mic_off' : 'mic'}</span>`;
  }
  if (callMediaStream) {
    callMediaStream.getAudioTracks().forEach(t => t.enabled = !callAudioMuted);
  }
  showToast(callAudioMuted ? 'Microphone muted' : 'Microphone unmuted', 'info');
}

function toggleCallVideo() {
  callVideoMuted = !callVideoMuted;
  const btn = document.getElementById('btn-toggle-cam');
  const videoEl = document.getElementById('local-video-elem');
  const placeholder = document.getElementById('local-video-placeholder');

  if (btn) {
    btn.classList.toggle('active-off', callVideoMuted);
    btn.innerHTML = `<span class="material-icons-round">${callVideoMuted ? 'videocam_off' : 'videocam'}</span>`;
  }
  if (videoEl && placeholder) {
    videoEl.style.display = callVideoMuted ? 'none' : 'block';
    placeholder.style.display = callVideoMuted ? 'flex' : 'none';
  }
  if (callMediaStream) {
    callMediaStream.getVideoTracks().forEach(t => t.enabled = !callVideoMuted);
  }
}

function toggleScreenShare() {
  showToast('Screen sharing mode active', 'info');
}

function sendInCallMessage() {
  const input = document.getElementById('incall-input');
  if (!input || !input.value.trim()) return;

  const msgs = document.getElementById('incall-msgs');
  if (msgs) {
    const msgEl = document.createElement('div');
    msgEl.className = 'incall-msg me';
    msgEl.innerHTML = `<strong>You:</strong> ${escapeHtml(input.value.trim())}`;
    msgs.appendChild(msgEl);
    msgs.scrollTop = msgs.scrollHeight;
  }
  input.value = '';
}

function endVideoCall() {
  clearInterval(callTimerInterval);
  if (callMediaStream) {
    callMediaStream.getTracks().forEach(t => t.stop());
    callMediaStream = null;
  }
  closeModal('video-modal');
  showToast('Consultation call ended', 'info');
}

// ========================================
// Gemini AI Medical Diagnosis & Triage
// ========================================

let currentDiagnosisData = null;

function initAITriagePage() {
  // Focus symptom input if empty
  const input = document.getElementById('ai-symptom-input');
  if (input && !input.value.trim()) {
    input.focus();
  }
}

function applySymptomPrompt(text) {
  const input = document.getElementById('ai-symptom-input');
  if (input) {
    input.value = text;
    input.focus();
    showToast('Sample symptoms loaded! Click "Analyze with Gemini AI"', 'info');
  }
}

function clearAITriage() {
  const input = document.getElementById('ai-symptom-input');
  if (input) input.value = '';
  const resultContainer = document.getElementById('ai-diagnosis-result');
  if (resultContainer) {
    resultContainer.style.display = 'none';
    resultContainer.innerHTML = '';
  }
  currentDiagnosisData = null;
}

async function runAITriage() {
  const input = document.getElementById('ai-symptom-input');
  const query = input ? input.value.trim() : '';

  if (!query) {
    showToast('Please enter your symptoms or medical concern first', 'warning');
    return;
  }

  const btn = document.getElementById('btn-run-diagnosis');
  const loading = document.getElementById('ai-loading');
  const resultContainer = document.getElementById('ai-diagnosis-result');

  btn.disabled = true;
  btn.innerHTML = '<span class="spinner" style="width:18px;height:18px;border-width:2px"></span><span>Analyzing...</span>';
  loading.style.display = 'block';
  resultContainer.style.display = 'none';

  try {
    const payload = {
      query,
      patientInfo: {
        name: state.user?.name,
        gender: state.user?.gender,
        dob: state.user?.date_of_birth
      }
    };

    const res = await apiFetch('/ai/diagnose', {
      method: 'POST',
      body: JSON.stringify(payload)
    });

    currentDiagnosisData = res;
    renderDiagnosisResult(res);
  } catch (err) {
    showToast(err.message, 'error');
  } finally {
    btn.disabled = false;
    btn.innerHTML = '<span class="material-icons-round">auto_awesome</span><span>Analyze with Gemini AI</span>';
    loading.style.display = 'none';
  }
}

function renderDiagnosisResult(data) {
  const resultContainer = document.getElementById('ai-diagnosis-result');
  if (!resultContainer) return;

  const d = data.diagnosis;
  const matchedDocs = data.matched_doctors || [];
  const urgency = (d.urgency_level || 'moderate').toLowerCase();

  resultContainer.innerHTML = `
    <!-- Main Diagnosis Summary Card -->
    <div class="diagnosis-card">
      <div class="diagnosis-header">
        <div class="diagnosis-title-group">
          <div style="display:flex;align-items:center;gap:8px;margin-bottom:6px">
            <span class="badge-gemini">
              <span class="material-icons-round" style="font-size:0.9rem">auto_awesome</span>
              Gemini AI Recognized Condition
            </span>
            <span style="font-size:0.8rem;color:var(--text-tertiary)">Analyzed just now</span>
          </div>
          <h2>${escapeHtml(d.condition_name || 'Medical Condition Identified')}</h2>
          <p style="color:var(--text-secondary);font-size:0.92rem">
            ${escapeHtml(d.urgency_label || 'Specialist Evaluation Recommended')}
          </p>

          <div class="symptoms-detected-list">
            ${(d.symptoms || []).map(s => `<span class="symptom-tag"><span class="material-icons-round" style="font-size:0.8rem">check</span> ${escapeHtml(s)}</span>`).join('')}
          </div>
        </div>

        <div style="text-align:right">
          <div class="urgency-badge urgency-${urgency}">
            <span class="material-icons-round" style="font-size:1rem">
              ${urgency === 'emergency' ? 'warning' : urgency === 'high' ? 'priority_high' : urgency === 'moderate' ? 'schedule' : 'check_circle'}
            </span>
            Urgency: ${urgency.toUpperCase()}
          </div>
        </div>
      </div>

      ${d.emergency_warning ? `
        <div style="background:rgba(239,68,68,0.15);border:1px solid #ef4444;border-radius:var(--radius-md);padding:14px;margin-top:var(--space-md);color:#fca5a5;font-weight:600;display:flex;align-items:center;gap:10px">
          <span class="material-icons-round" style="font-size:1.8rem;color:#ef4444">emergency</span>
          <div>
            <div style="color:#fff;font-size:0.95rem">Urgent Clinical Attention Notice</div>
            <div style="font-size:0.85rem">${escapeHtml(d.emergency_warning)}</div>
          </div>
        </div>
      ` : ''}

      <div class="diagnosis-body">
        <div>
          <h4 style="font-size:0.95rem;font-weight:700;color:var(--text-primary);margin-bottom:8px;display:flex;align-items:center;gap:6px">
            <span class="material-icons-round" style="color:var(--primary-light)">description</span>
            Clinical Assessment Overview
          </h4>
          <div class="clinical-text-box">
            ${escapeHtml(d.clinical_assessment || '')}
          </div>
        </div>

        <div class="insights-two-col">
          <div class="insight-card">
            <h4><span class="material-icons-round">health_and_safety</span> Pre-Consultation Self-Care</h4>
            <p style="font-size:0.88rem;color:var(--text-secondary);line-height:1.6">
              ${escapeHtml(d.pre_consultation_advice || 'Maintain rest and avoid strenuous exertion until your appointment.')}
            </p>
          </div>

          <div class="insight-card">
            <h4><span class="material-icons-round">contact_support</span> Questions to Ask Your Doctor</h4>
            <ul>
              ${(d.questions_to_ask_doctor || []).map(q => `
                <li>
                  <span class="bullet">•</span>
                  <span>${escapeHtml(q)}</span>
                </li>
              `).join('')}
            </ul>
          </div>
        </div>
      </div>
    </div>

    <!-- Recommended Doctors for Booking -->
    <div>
      <div class="recommended-doctors-header">
        <div>
          <h3 style="font-size:1.3rem;font-weight:700;display:flex;align-items:center;gap:8px">
            <span class="material-icons-round" style="color:var(--primary-light)">recommend</span>
            Recommended Specialists for Your Condition
          </h3>
          <p style="color:var(--text-secondary);font-size:0.88rem">
            Matched specifically for <strong>${escapeHtml((d.recommended_specialties || []).join(' & '))}</strong>. Booking with these doctors will automatically share your Gemini condition assessment with them!
          </p>
        </div>
      </div>

      <div class="matched-doctors-grid">
        ${matchedDocs.map(doc => `
          <div class="matched-doctor-card">
            <span class="match-badge-top">
              <span class="material-icons-round" style="font-size:0.75rem;vertical-align:middle">auto_awesome</span>
              ${escapeHtml(doc.specialty)} Match
            </span>
            <div>
              <div style="display:flex;gap:var(--space-md);align-items:center;margin-bottom:var(--space-md)">
                <img src="${doc.avatar_url || ''}" alt="${doc.name}" style="width:64px;height:64px;border-radius:16px;object-fit:cover" onerror="this.style.display='none'">
                <div>
                  <h4 style="font-size:1.1rem;font-weight:700;margin-bottom:2px">${escapeHtml(doc.name)}</h4>
                  <p style="color:var(--primary-light);font-size:0.85rem;font-weight:500">${escapeHtml(doc.specialty)} • ${escapeHtml(doc.qualification)}</p>
                  <div style="display:flex;align-items:center;gap:8px;font-size:0.82rem;color:var(--text-tertiary);margin-top:4px">
                    <span style="color:#f59e0b;display:inline-flex;align-items:center;font-weight:600">
                      <span class="material-icons-round" style="font-size:0.95rem">star</span> ${doc.rating || 4.8}
                    </span>
                    <span>•</span>
                    <span>${doc.experience_years || 10}+ yrs exp</span>
                  </div>
                </div>
              </div>
              <p style="font-size:0.84rem;color:var(--text-secondary);line-height:1.5;margin-bottom:var(--space-md);display:-webkit-box;-webkit-line-clamp:2;-webkit-box-orient:vertical;overflow:hidden">
                ${escapeHtml(doc.bio || '')}
              </p>
            </div>

            <div style="display:flex;justify-content:space-between;align-items:center;padding-top:var(--space-md);border-top:1px solid var(--border)">
              <div>
                <span style="font-size:0.75rem;color:var(--text-tertiary);display:block">Consultation Fee</span>
                <span style="font-size:1.15rem;font-weight:700;color:var(--text-primary)">₹${doc.consultation_fee}</span>
              </div>
              <button class="btn btn-primary" onclick="bookWithDoctorFromTriage(${doc.id})">
                <span class="material-icons-round">calendar_today</span>
                <span>Book Consultation</span>
              </button>
            </div>
          </div>
        `).join('')}
      </div>
    </div>
  `;

  resultContainer.style.display = 'flex';
  resultContainer.scrollIntoView({ behavior: 'smooth', block: 'start' });
}

function bookWithDoctorFromTriage(doctorId) {
  if (!currentDiagnosisData || !currentDiagnosisData.diagnosis) {
    openBooking(doctorId);
    return;
  }
  openBooking(doctorId, currentDiagnosisData.diagnosis);
}


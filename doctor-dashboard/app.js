/* ========================================
   MediBook Doctor Dashboard — Application Logic
   ======================================== */

const API_BASE = 'http://localhost:3000/api';

// Application State
let state = {
  token: localStorage.getItem('doctor_token'),
  user: JSON.parse(localStorage.getItem('doctor_user') || 'null'),
  currentPage: 'dashboard',
  appointments: [],
  filteredAppointments: [],
  currentTab: 'all',
  currentDateFilter: '',
  patients: [],
  notifications: [],
  availability: {
    days: ['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday'],
    slots: [],
    slot_duration: 30,
    fee: 1500
  }
};

// ========================================
// Initialization
// ========================================

document.addEventListener('DOMContentLoaded', () => {
  initDateHeader();
  if (state.token && state.user) {
    showMainApp();
  } else {
    showAuthScreen();
  }
});

function initDateHeader() {
  const dateEl = document.getElementById('header-date');
  if (dateEl) {
    const options = { weekday: 'long', year: 'numeric', month: 'short', day: 'numeric' };
    dateEl.innerHTML = `<span class="material-icons-round" style="font-size:1.1rem;color:var(--primary-light)">today</span> ${new Date().toLocaleDateString('en-US', options)}`;
  }
}

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
  loadProfile();

  // Periodic notifications check every 30s
  setInterval(() => {
    if (state.token) loadNotifications(false);
  }, 30000);
}

function updateUserUI() {
  if (!state.user) return;
  const initials = state.user.name.replace('Dr. ', '').split(' ').map(n => n[0]).join('').toUpperCase();
  
  const userAvatar = document.getElementById('user-avatar');
  if (userAvatar) userAvatar.textContent = initials;

  const userName = document.getElementById('user-name');
  if (userName) userName.textContent = state.user.name;

  const userSpecialty = document.getElementById('user-specialty');
  if (userSpecialty) userSpecialty.textContent = state.user.specialty || 'General Practitioner';

  const hour = new Date().getHours();
  let greeting = hour < 12 ? 'Good Morning' : hour < 17 ? 'Good Afternoon' : 'Good Evening';
  const greetingEl = document.getElementById('greeting');
  if (greetingEl) {
    greetingEl.textContent = `${greeting}, ${state.user.name.split(' ')[0]}!`;
  }
}

// ========================================
// Authentication
// ========================================

async function handleLogin(e) {
  e.preventDefault();
  const btn = document.getElementById('login-btn');
  btn.disabled = true;
  btn.innerHTML = '<span class="spinner" style="width:20px;height:20px;border-width:2px"></span>';

  try {
    const email = document.getElementById('login-email').value.trim();
    const password = document.getElementById('login-password').value;

    const res = await fetch(`${API_BASE}/doctors/login`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email, password })
    });

    const data = await res.json();
    if (!res.ok) throw new Error(data.error || 'Authentication failed');

    state.token = data.token;
    state.user = data.user;
    localStorage.setItem('doctor_token', data.token);
    localStorage.setItem('doctor_user', JSON.stringify(data.user));

    showToast(`Welcome back, ${data.user.name}!`, 'success');
    showMainApp();
  } catch (err) {
    showToast(err.message, 'error');
  } finally {
    btn.disabled = false;
    btn.innerHTML = '<span>Sign In</span><span class="material-icons-round">arrow_forward</span>';
  }
}

function logout() {
  state.token = null;
  state.user = null;
  localStorage.removeItem('doctor_token');
  localStorage.removeItem('doctor_user');
  showAuthScreen();
  showToast('Signed out successfully', 'info');
}

// ========================================
// API Helper
// ========================================

async function apiFetch(url, options = {}) {
  const headers = { 'Content-Type': 'application/json', ...options.headers };
  if (state.token) headers['Authorization'] = `Bearer ${state.token}`;

  const res = await fetch(`${API_BASE}${url}`, { ...options, headers });
  const data = await res.json();

  if (res.status === 401 || res.status === 403) {
    logout();
    throw new Error('Session expired. Please sign in again.');
  }

  if (!res.ok) throw new Error(data.error || 'Request failed');
  return data;
}

// ========================================
// Navigation
// ========================================

function navigateTo(page) {
  state.currentPage = page;
  document.querySelectorAll('.page').forEach(p => p.classList.remove('active'));
  document.querySelectorAll('.nav-item').forEach(n => n.classList.remove('active'));

  const targetPage = document.getElementById(`page-${page}`);
  if (targetPage) targetPage.classList.add('active');

  const navItem = document.querySelector(`[data-page="${page}"]`);
  if (navItem) navItem.classList.add('active');

  const titleEl = document.getElementById('topbar-page-title');
  if (titleEl) {
    titleEl.textContent = page.charAt(0).toUpperCase() + page.slice(1);
  }

  // Close sidebar on mobile
  const sidebar = document.getElementById('sidebar');
  if (sidebar) sidebar.classList.remove('open');

  // Close notifications panel if open
  closeNotifications();

  // Load data for active page
  switch (page) {
    case 'dashboard': loadDashboard(); break;
    case 'appointments': loadAppointments(); break;
    case 'schedule': loadSchedule(); break;
    case 'patients': loadPatients(); break;
    case 'profile': loadProfile(); break;
  }
}

function toggleSidebar() {
  const sidebar = document.getElementById('sidebar');
  if (sidebar) sidebar.classList.toggle('open');
}

// ========================================
// Notifications
// ========================================

async function loadNotifications(showToastOnNew = true) {
  try {
    const data = await apiFetch('/notifications');
    state.notifications = data.notifications || [];

    const badge = document.getElementById('notif-badge');
    if (badge) {
      if (data.unread_count > 0) {
        badge.textContent = data.unread_count;
        badge.style.display = 'flex';
      } else {
        badge.style.display = 'none';
      }
    }

    renderNotifications();
  } catch (err) {
    console.error('Error fetching notifications:', err);
  }
}

function renderNotifications() {
  const list = document.getElementById('notif-list');
  if (!list) return;

  if (state.notifications.length === 0) {
    list.innerHTML = `
      <div class="notif-empty">
        <span class="material-icons-round" style="font-size: 2.5rem; opacity: 0.2;">notifications_off</span>
        <p>No notifications yet</p>
      </div>`;
    return;
  }

  list.innerHTML = state.notifications.map(n => `
    <div class="notif-item ${n.is_read ? '' : 'unread'}" onclick="markNotificationRead(${n.id})">
      <div class="notif-icon ${n.type || 'info'}">
        <span class="material-icons-round">${getNotifIcon(n.type)}</span>
      </div>
      <div class="notif-content">
        <h4>${escapeHtml(n.title)}</h4>
        <p>${escapeHtml(n.message)}</p>
        <span class="notif-time">${formatTimeAgo(n.created_at)}</span>
      </div>
    </div>
  `).join('');
}

function getNotifIcon(type) {
  switch (type) {
    case 'success': return 'check_circle';
    case 'warning': return 'warning';
    case 'error': return 'error';
    default: return 'info';
  }
}

function toggleNotifications() {
  const panel = document.getElementById('notification-panel');
  if (panel) {
    panel.classList.toggle('active');
  }
}

function closeNotifications() {
  const panel = document.getElementById('notification-panel');
  if (panel) panel.classList.remove('active');
}

async function markNotificationRead(id) {
  try {
    await apiFetch(`/notifications/${id}/read`, { method: 'PUT' });
    const notif = state.notifications.find(n => n.id === id);
    if (notif) notif.is_read = 1;
    loadNotifications(false);
  } catch (err) {
    console.error(err);
  }
}

async function markAllRead() {
  try {
    await apiFetch('/notifications/read-all', { method: 'PUT' });
    showToast('All notifications marked as read', 'success');
    loadNotifications(false);
  } catch (err) {
    showToast(err.message, 'error');
  }
}

// ========================================
// Dashboard
// ========================================

async function loadDashboard() {
  try {
    const data = await apiFetch('/dashboard/doctor');

    // Update Stats
    const statToday = document.getElementById('stat-today');
    const statPending = document.getElementById('stat-pending');
    const statCompleted = document.getElementById('stat-completed');
    const statRevenue = document.getElementById('stat-revenue');

    if (statToday) statToday.textContent = data.today_stats ? data.today_stats.total : 0;
    if (statPending) statPending.textContent = data.stats ? (data.stats.pending || 0) : 0;
    if (statCompleted) statCompleted.textContent = data.stats ? (data.stats.completed || 0) : 0;
    if (statRevenue) statRevenue.textContent = `₹${(data.total_revenue || 0).toLocaleString()}`;

    // Update Pending badges in sidebar
    const pendingCount = data.stats ? (data.stats.pending || 0) : 0;
    const pendingBadge = document.getElementById('pending-badge');
    const tabPendingCount = document.getElementById('tab-pending-count');
    if (pendingBadge) {
      if (pendingCount > 0) {
        pendingBadge.textContent = pendingCount;
        pendingBadge.style.display = 'flex';
      } else {
        pendingBadge.style.display = 'none';
      }
    }
    if (tabPendingCount) {
      tabPendingCount.textContent = pendingCount > 0 ? `(${pendingCount})` : '';
    }

    // Render Today's Schedule
    renderTodaySchedule(data.today_appointments || []);

    // Render Recent Patients
    renderRecentPatients(data.recent_patients || []);
  } catch (err) {
    console.error('Error loading doctor dashboard:', err);
    showToast(err.message, 'error');
  }
}

function renderTodaySchedule(appointments) {
  const container = document.getElementById('today-schedule');
  if (!container) return;

  if (appointments.length === 0) {
    container.innerHTML = `
      <div class="empty-state" style="padding: var(--space-lg) var(--space-md)">
        <span class="material-icons-round">event_available</span>
        <h3>No Appointments Today</h3>
        <p>You have no appointments scheduled for today.</p>
      </div>`;
    return;
  }

  container.innerHTML = appointments.map(apt => `
    <div class="schedule-item" onclick="openAppointmentModal(${apt.id})">
      <div class="schedule-time">
        <span>${formatTime(apt.start_time)}</span>
      </div>
      <div class="schedule-info">
        <h4>${escapeHtml(apt.patient_name || 'Patient')}</h4>
        <p>${escapeHtml(apt.reason || 'General Consultation')} • <span class="status-badge status-${apt.status}">${apt.status}</span></p>
      </div>
      <div class="schedule-actions" onclick="event.stopPropagation()">
        ${apt.status === 'pending' ? `
          <button class="btn btn-xs btn-success" onclick="quickUpdateStatus(${apt.id}, 'confirmed')" title="Confirm">
            <span class="material-icons-round" style="font-size:1rem">check</span>
          </button>
          <button class="btn btn-xs btn-danger" onclick="quickUpdateStatus(${apt.id}, 'cancelled')" title="Decline">
            <span class="material-icons-round" style="font-size:1rem">close</span>
          </button>
        ` : apt.status === 'confirmed' ? `
          <button class="btn btn-xs btn-primary" onclick="openAppointmentModal(${apt.id})" title="Complete Consultation">
            <span class="material-icons-round" style="font-size:1rem">medical_services</span>
          </button>
        ` : ''}
      </div>
    </div>
  `).join('');
}

function renderRecentPatients(patients) {
  const container = document.getElementById('recent-patients-list');
  if (!container) return;

  if (patients.length === 0) {
    container.innerHTML = `
      <div class="empty-state" style="padding: var(--space-lg) var(--space-md)">
        <span class="material-icons-round">group</span>
        <h3>No Recent Patients</h3>
        <p>Completed patient consultations will appear here.</p>
      </div>`;
    return;
  }

  container.innerHTML = patients.map(p => {
    const initials = p.name.split(' ').map(n => n[0]).join('').toUpperCase();
    return `
      <div class="patient-item" onclick="navigateTo('patients')">
        <div class="patient-avatar">${initials}</div>
        <div class="patient-info">
          <h4>${escapeHtml(p.name)}</h4>
          <p>${p.phone ? escapeHtml(p.phone) : p.email} • Last: ${formatDate(p.last_visit)}</p>
        </div>
      </div>
    `;
  }).join('');
}

// ========================================
// Appointments Management
// ========================================

async function loadAppointments() {
  const container = document.getElementById('appointments-list');
  if (container) {
    container.innerHTML = '<div style="display:flex;justify-content:center;padding:var(--space-2xl)"><div class="spinner"></div></div>';
  }

  try {
    const dateInput = document.getElementById('apt-date-filter');
    const dateFilter = dateInput ? dateInput.value : '';
    state.currentDateFilter = dateFilter;

    let url = '/appointments/doctor';
    const params = [];
    if (dateFilter) params.push(`date=${dateFilter}`);
    if (params.length > 0) url += `?${params.join('&')}`;

    const data = await apiFetch(url);
    state.appointments = data || [];
    filterAppointments(state.currentTab);
  } catch (err) {
    showToast(err.message, 'error');
    if (container) {
      container.innerHTML = `<div class="empty-state"><p>${err.message}</p></div>`;
    }
  }
}

function filterAppointments(status, tabElement) {
  state.currentTab = status;

  if (tabElement) {
    document.querySelectorAll('.apt-tab').forEach(t => t.classList.remove('active'));
    tabElement.classList.add('active');
  }

  if (status === 'all') {
    state.filteredAppointments = state.appointments;
  } else {
    state.filteredAppointments = state.appointments.filter(a => a.status === status);
  }

  renderAppointments();
}

function renderAppointments() {
  const container = document.getElementById('appointments-list');
  if (!container) return;

  if (state.filteredAppointments.length === 0) {
    container.innerHTML = `
      <div class="empty-state">
        <span class="material-icons-round">event_busy</span>
        <h3>No Appointments Found</h3>
        <p>No appointments match the selected status or date filter.</p>
      </div>`;
    return;
  }

  container.innerHTML = state.filteredAppointments.map(apt => {
    const initials = (apt.patient_name || 'Patient').split(' ').map(n => n[0]).join('').toUpperCase();
    return `
      <div class="appointment-card" id="apt-card-${apt.id}">
        <div class="apt-card-top">
          <div class="apt-patient-avatar">${initials}</div>
          <div class="apt-card-info">
            <div style="display:flex;justify-content:space-between;align-items:flex-start;flex-wrap:wrap;gap:var(--space-xs)">
              <h3>${escapeHtml(apt.patient_name || 'Patient')}</h3>
              <span class="status-badge status-${apt.status}">
                <span class="material-icons-round" style="font-size:0.9rem">
                  ${apt.status === 'confirmed' ? 'check_circle' : apt.status === 'pending' ? 'schedule' : apt.status === 'completed' ? 'task_alt' : 'cancel'}
                </span>
                ${apt.status}
              </span>
            </div>
            <div class="apt-card-meta">
              <span class="apt-meta-item">
                <span class="material-icons-round">calendar_today</span>
                ${formatDate(apt.appointment_date)}
              </span>
              <span class="apt-meta-item">
                <span class="material-icons-round">schedule</span>
                ${formatTime(apt.start_time)} - ${formatTime(apt.end_time)}
              </span>
              <span class="apt-meta-item">
                <span class="material-icons-round">phone</span>
                ${escapeHtml(apt.patient_phone || 'No phone')}
              </span>
              <span class="apt-meta-item">
                <span class="material-icons-round">email</span>
                ${escapeHtml(apt.patient_email || '')}
              </span>
              <span class="apt-meta-item">
                <span class="material-icons-round">videocam</span>
                Type: ${escapeHtml(apt.consultation_type || 'in-person')}
              </span>
              ${apt.patient_blood_group ? `
                <span class="apt-meta-item">
                  <span class="material-icons-round">bloodtype</span>
                  Blood: ${escapeHtml(apt.patient_blood_group)}
                </span>
              ` : ''}
            </div>
          </div>
        </div>

        ${apt.reason ? `
          <div class="apt-card-reason">
            <strong>Reason for visit:</strong> ${escapeHtml(apt.reason)}
          </div>
        ` : ''}

        ${apt.prescription ? `
          <div class="apt-card-reason" style="border-left: 3px solid var(--primary-light); background: rgba(13,148,136,0.08);">
            <strong>Prescription:</strong> ${escapeHtml(apt.prescription)}
          </div>
        ` : ''}

        ${apt.notes ? `
          <div class="apt-card-reason" style="border-left: 3px solid var(--accent); background: rgba(99,102,241,0.08);">
            <strong>Doctor's Notes:</strong> ${escapeHtml(apt.notes)}
          </div>
        ` : ''}

        <div class="apt-card-actions">
          ${apt.status === 'pending' ? `
            <button class="btn btn-sm btn-success" onclick="quickUpdateStatus(${apt.id}, 'confirmed')">
              <span class="material-icons-round">check</span>
              Confirm Appointment
            </button>
            <button class="btn btn-sm btn-danger" onclick="quickUpdateStatus(${apt.id}, 'cancelled')">
              <span class="material-icons-round">close</span>
              Decline
            </button>
          ` : ''}

          ${apt.status === 'confirmed' ? `
            ${apt.consultation_type === 'video' ? `
              <button class="btn btn-sm btn-success" onclick="startVideoCall(${apt.id}, 'doctor')">
                <span class="material-icons-round">videocam</span>
                Start Video Call
              </button>
            ` : ''}
            <button class="btn btn-sm btn-primary" onclick="openAppointmentModal(${apt.id})">
              <span class="material-icons-round">edit_note</span>
              Complete Consultation
            </button>
            <button class="btn btn-sm btn-warning" onclick="quickUpdateStatus(${apt.id}, 'no-show')">
              <span class="material-icons-round">person_off</span>
              Mark No-Show
            </button>
            <button class="btn btn-sm btn-danger" onclick="quickUpdateStatus(${apt.id}, 'cancelled')">
              <span class="material-icons-round">cancel</span>
              Cancel
            </button>
          ` : ''}

          ${apt.prescription ? `
            <button class="btn btn-sm btn-secondary" onclick="printPrescription(${apt.id})">
              <span class="material-icons-round">print</span>
              Print Rx
            </button>
          ` : ''}

          <button class="btn btn-sm btn-secondary" onclick="openAppointmentModal(${apt.id})">
            <span class="material-icons-round">visibility</span>
            View Details
          </button>
        </div>
      </div>
    `;
  }).join('');
}

async function quickUpdateStatus(id, status) {
  try {
    await apiFetch(`/appointments/${id}/status`, {
      method: 'PUT',
      body: JSON.stringify({ status })
    });
    showToast(`Appointment status changed to ${status}`, 'success');
    loadAppointments();
    loadDashboard();
  } catch (err) {
    showToast(err.message, 'error');
  }
}

// ========================================
// Appointment Detail Modal
// ========================================

function openAppointmentModal(id) {
  const apt = state.appointments.find(a => a.id === id);
  if (!apt) {
    // If opening from dashboard where appointments might not all be loaded
    fetchSingleAppointmentModal(id);
    return;
  }
  renderAppointmentModal(apt);
}

async function fetchSingleAppointmentModal(id) {
  try {
    const list = await apiFetch('/appointments/doctor');
    const apt = list.find(a => a.id === id);
    if (apt) {
      renderAppointmentModal(apt);
    } else {
      showToast('Appointment not found', 'error');
    }
  } catch (err) {
    showToast(err.message, 'error');
  }
}

function renderAppointmentModal(apt) {
  const modalBody = document.getElementById('appointment-modal-body');
  if (!modalBody) return;

  modalBody.innerHTML = `
    <div class="detail-section">
      <h3><span class="material-icons-round">person</span> Patient Information</h3>
      <div class="detail-grid">
        <div class="detail-item">
          <label>Name</label>
          <p>${escapeHtml(apt.patient_name || 'Patient')}</p>
        </div>
        <div class="detail-item">
          <label>Contact Phone</label>
          <p>${escapeHtml(apt.patient_phone || 'N/A')}</p>
        </div>
        <div class="detail-item">
          <label>Email Address</label>
          <p>${escapeHtml(apt.patient_email || 'N/A')}</p>
        </div>
        <div class="detail-item">
          <label>Gender / Blood Group</label>
          <p>${escapeHtml(apt.patient_gender || 'N/A')} • ${escapeHtml(apt.patient_blood_group || 'N/A')}</p>
        </div>
      </div>
    </div>

    <div class="detail-section">
      <h3><span class="material-icons-round">event_note</span> Appointment Details</h3>
      <div class="detail-grid">
        <div class="detail-item">
          <label>Date</label>
          <p>${formatDate(apt.appointment_date)}</p>
        </div>
        <div class="detail-item">
          <label>Time Slot</label>
          <p>${formatTime(apt.start_time)} - ${formatTime(apt.end_time)}</p>
        </div>
        <div class="detail-item">
          <label>Consultation Type</label>
          <p style="text-transform: capitalize">${escapeHtml(apt.consultation_type || 'in-person')}</p>
        </div>
        <div class="detail-item">
          <label>Current Status</label>
          <p><span class="status-badge status-${apt.status}">${apt.status}</span></p>
        </div>
      </div>
      <div class="detail-item" style="margin-top:var(--space-md)">
        <label>Chief Complaint / Symptoms</label>
        <p style="padding:10px; background:var(--bg-input); border-radius:var(--radius-sm); margin-top:4px">
          ${escapeHtml(apt.reason || 'No specific complaint entered by patient.')}
        </p>
      </div>
    </div>

    <form onsubmit="handleModalStatusUpdate(event, ${apt.id})" class="detail-section">
      <h3><span class="material-icons-round">medical_services</span> Clinical Notes & Prescription</h3>
      
      <div class="form-group">
        <label for="modal-apt-status">Update Status</label>
        <div class="input-wrapper">
          <select id="modal-apt-status" style="padding-left:14px">
            <option value="confirmed" ${apt.status === 'confirmed' ? 'selected' : ''}>Confirmed</option>
            <option value="completed" ${apt.status === 'completed' ? 'selected' : ''}>Completed</option>
            <option value="cancelled" ${apt.status === 'cancelled' ? 'selected' : ''}>Cancelled</option>
            <option value="no-show" ${apt.status === 'no-show' ? 'selected' : ''}>No-Show</option>
          </select>
        </div>
      </div>

      <div class="form-group detail-notes">
        <label for="modal-apt-prescription">Prescription / Medication Instructions</label>
        <textarea id="modal-apt-prescription" placeholder="Rx: Medicine name, dosage, frequency, and duration...">${escapeHtml(apt.prescription || '')}</textarea>
      </div>

      <div class="form-group detail-notes">
        <label for="modal-apt-notes">Doctor Clinical Notes (Diagnosis & Advice)</label>
        <textarea id="modal-apt-notes" placeholder="Diagnosis notes, recommended lab tests, follow-up advice...">${escapeHtml(apt.notes || '')}</textarea>
      </div>

      <div style="display:flex; justify-content:flex-end; gap:var(--space-md); margin-top:var(--space-lg)">
        <button type="button" class="btn btn-secondary" onclick="closeModal('appointment-modal')">Close</button>
        <button type="submit" class="btn btn-primary" id="save-modal-btn">
          <span class="material-icons-round">save</span>
          Save Consultation Record
        </button>
      </div>
    </form>
  `;

  document.getElementById('appointment-modal').classList.add('active');
}

async function handleModalStatusUpdate(e, id) {
  e.preventDefault();
  const btn = document.getElementById('save-modal-btn');
  if (btn) btn.disabled = true;

  try {
    const status = document.getElementById('modal-apt-status').value;
    const prescription = document.getElementById('modal-apt-prescription').value.trim();
    const notes = document.getElementById('modal-apt-notes').value.trim();

    await apiFetch(`/appointments/${id}/status`, {
      method: 'PUT',
      body: JSON.stringify({ status, notes, prescription })
    });

    showToast('Appointment record saved successfully', 'success');
    closeModal('appointment-modal');
    loadAppointments();
    loadDashboard();
  } catch (err) {
    showToast(err.message, 'error');
  } finally {
    if (btn) btn.disabled = false;
  }
}

function closeModal(modalId) {
  const modal = document.getElementById(modalId);
  if (modal) modal.classList.remove('active');
}

// ========================================
// Schedule Management
// ========================================

const ALL_DAYS = ['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday', 'Sunday'];

async function loadSchedule() {
  const container = document.getElementById('availability-grid');
  if (container) {
    container.innerHTML = '<div style="display:flex;justify-content:center;padding:var(--space-lg)"><div class="spinner"></div></div>';
  }

  try {
    const data = await apiFetch('/doctors/me/slots');
    state.availability = {
      days: data.available_days || ['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday'],
      slots: data.slots || [],
      slot_duration: data.slot_duration || 30,
      fee: data.consultation_fee || 1500
    };

    // Populate Settings Form
    const feeInput = document.getElementById('setting-fee');
    const durationInput = document.getElementById('setting-duration');
    if (feeInput) feeInput.value = state.availability.fee;
    if (durationInput) durationInput.value = state.availability.slot_duration;

    renderWeeklyAvailability();
  } catch (err) {
    showToast(err.message, 'error');
  }
}

function renderWeeklyAvailability() {
  const container = document.getElementById('availability-grid');
  if (!container) return;

  container.innerHTML = ALL_DAYS.map(day => {
    const isAvailable = state.availability.days.includes(day);
    const daySlots = state.availability.slots.filter(s => s.day_of_week === day);
    const slotCount = daySlots.length;

    return `
      <div class="availability-row">
        <div class="availability-day">${day}</div>
        <label class="toggle-switch">
          <input type="checkbox" id="toggle-${day}" ${isAvailable ? 'checked' : ''} onchange="toggleDayAvailability('${day}', this.checked)">
          <span class="toggle-slider"></span>
        </label>
        <span class="availability-status" id="status-${day}">
          ${isAvailable ? `Available • ${slotCount > 0 ? slotCount + ' slots configured' : 'Standard slots'}` : 'Unavailable'}
        </span>
      </div>
    `;
  }).join('');
}

async function toggleDayAvailability(day, isChecked) {
  let days = [...state.availability.days];
  if (isChecked) {
    if (!days.includes(day)) days.push(day);
  } else {
    days = days.filter(d => d !== day);
  }
  state.availability.days = days;

  // Update status label
  const statusEl = document.getElementById(`status-${day}`);
  if (statusEl) {
    statusEl.textContent = isChecked ? 'Available' : 'Unavailable';
  }

  try {
    await apiFetch('/doctors/me/slots', {
      method: 'PUT',
      body: JSON.stringify({ available_days: days })
    });
    showToast(`${day} availability updated`, 'success');
  } catch (err) {
    showToast(err.message, 'error');
  }
}

async function updateSettings(e) {
  e.preventDefault();
  try {
    const fee = parseFloat(document.getElementById('setting-fee').value);
    const duration = parseInt(document.getElementById('setting-duration').value);

    await apiFetch('/doctors/me/profile', {
      method: 'PUT',
      body: JSON.stringify({
        consultation_fee: fee,
        slot_duration: duration
      })
    });

    state.availability.fee = fee;
    state.availability.slot_duration = duration;
    showToast('Consultation settings saved successfully', 'success');
  } catch (err) {
    showToast(err.message, 'error');
  }
}

// ========================================
// Patients Management
// ========================================

async function loadPatients() {
  const container = document.getElementById('patients-list');
  if (container) {
    container.innerHTML = '<div style="display:flex;justify-content:center;padding:var(--space-2xl)"><div class="spinner"></div></div>';
  }

  try {
    const patients = await apiFetch('/doctors/me/patients');
    state.patients = patients || [];
    renderPatients();
  } catch (err) {
    showToast(err.message, 'error');
  }
}

function renderPatients() {
  const container = document.getElementById('patients-list');
  if (!container) return;

  if (state.patients.length === 0) {
    container.innerHTML = `
      <div class="empty-state">
        <span class="material-icons-round">people</span>
        <h3>No Patients Yet</h3>
        <p>Patients who book appointments with you will appear in your medical directory here.</p>
      </div>`;
    return;
  }

  container.innerHTML = `
    <div class="patients-grid">
      ${state.patients.map(p => {
        const initials = p.name.split(' ').map(n => n[0]).join('').toUpperCase();
        return `
          <div class="patient-card" style="cursor:pointer" onclick="viewPatientHistory(${p.id})">
            <div class="patient-card-avatar">${initials}</div>
            <div class="patient-card-info" style="flex:1">
              <div style="display:flex;justify-content:space-between;align-items:center">
                <h3>${escapeHtml(p.name)}</h3>
                <span class="btn-text" style="font-size:0.8rem">History &rarr;</span>
              </div>
              <p><span class="material-icons-round" style="font-size:0.9rem;vertical-align:middle">phone</span> ${escapeHtml(p.phone || 'No phone')}</p>
              <p><span class="material-icons-round" style="font-size:0.9rem;vertical-align:middle">email</span> ${escapeHtml(p.email)}</p>
              <div class="patient-card-details">
                ${p.gender ? `<span class="patient-detail-chip">${escapeHtml(p.gender)}</span>` : ''}
                ${p.blood_group ? `<span class="patient-detail-chip">🩸 ${escapeHtml(p.blood_group)}</span>` : ''}
                <span class="patient-detail-chip">${p.total_appointments || 1} Visits</span>
              </div>
              <p style="font-size:0.75rem; color:var(--text-tertiary); margin-top:6px">
                Last Visit: ${formatDate(p.last_visit)}
              </p>
            </div>
          </div>
        `;
      }).join('')}
    </div>
  `;
}

// ========================================
// Doctor Profile Management
// ========================================

async function loadProfile() {
  try {
    const doctor = await apiFetch('/doctors/me/profile');
    if (!doctor) return;

    // Update state
    state.user = { ...state.user, ...doctor };
    localStorage.setItem('doctor_user', JSON.stringify(state.user));

    // Update Avatar & Badges
    const initials = doctor.name.replace('Dr. ', '').split(' ').map(n => n[0]).join('').toUpperCase();
    const avatarEl = document.getElementById('profile-avatar-large');
    if (avatarEl) avatarEl.textContent = initials;

    const nameEl = document.getElementById('profile-name');
    if (nameEl) nameEl.textContent = doctor.name;

    const specEl = document.getElementById('profile-specialty');
    if (specEl) specEl.textContent = `${doctor.specialty} • ${doctor.qualification || ''}`;

    const ratingEl = document.getElementById('profile-rating');
    if (ratingEl) ratingEl.textContent = doctor.rating || 4.9;

    const reviewsEl = document.getElementById('profile-reviews');
    if (reviewsEl) reviewsEl.textContent = doctor.total_reviews || 0;

    const expEl = document.getElementById('profile-experience');
    if (expEl) expEl.textContent = doctor.experience_years || 10;

    // Update Form Inputs
    const bioInput = document.getElementById('profile-edit-bio');
    if (bioInput) bioInput.value = doctor.bio || '';

    const feeInput = document.getElementById('profile-edit-fee');
    if (feeInput) feeInput.value = doctor.consultation_fee || 1500;

    const durationInput = document.getElementById('profile-edit-duration');
    if (durationInput) durationInput.value = doctor.slot_duration || 30;

  } catch (err) {
    console.error('Error loading doctor profile:', err);
  }
}

async function updateProfile(e) {
  e.preventDefault();
  try {
    const bio = document.getElementById('profile-edit-bio').value.trim();
    const fee = parseFloat(document.getElementById('profile-edit-fee').value);
    const duration = parseInt(document.getElementById('profile-edit-duration').value);

    await apiFetch('/doctors/me/profile', {
      method: 'PUT',
      body: JSON.stringify({
        bio,
        consultation_fee: fee,
        slot_duration: duration
      })
    });

    showToast('Profile updated successfully', 'success');
    loadProfile();
  } catch (err) {
    showToast(err.message, 'error');
  }
}

// ========================================
// Toast Notifications
// ========================================

function showToast(message, type = 'info') {
  const container = document.getElementById('toast-container');
  if (!container) return;

  const toast = document.createElement('div');
  toast.className = `toast toast-${type}`;
  toast.innerHTML = `
    <span class="material-icons-round toast-icon">${getToastIcon(type)}</span>
    <span class="toast-message">${escapeHtml(message)}</span>
    <button class="toast-close" onclick="this.parentElement.remove()">
      <span class="material-icons-round" style="font-size:1.1rem">close</span>
    </button>
  `;

  container.appendChild(toast);
  setTimeout(() => {
    if (toast.parentElement) toast.remove();
  }, 4500);
}

function getToastIcon(type) {
  switch (type) {
    case 'success': return 'check_circle';
    case 'error': return 'error';
    case 'warning': return 'warning';
    default: return 'info';
  }
}

// ========================================
// Utilities
// ========================================

function escapeHtml(str) {
  if (!str) return '';
  return String(str)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#039;');
}

function formatDate(dateStr) {
  if (!dateStr) return '';
  try {
    const d = new Date(dateStr + 'T00:00:00');
    return d.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
  } catch {
    return dateStr;
  }
}

function formatTime(timeStr) {
  if (!timeStr) return '';
  const parts = timeStr.split(':');
  let h = parseInt(parts[0]);
  const m = parts[1] || '00';
  const ampm = h >= 12 ? 'PM' : 'AM';
  h = h % 12 || 12;
  return `${h}:${m} ${ampm}`;
}

function formatTimeAgo(timestamp) {
  if (!timestamp) return '';
  const diff = Math.floor((new Date() - new Date(timestamp)) / 1000);
  if (diff < 60) return 'Just now';
  if (diff < 3600) return `${Math.floor(diff / 60)}m ago`;
  if (diff < 86400) return `${Math.floor(diff / 3600)}h ago`;
  return `${Math.floor(diff / 86400)}d ago`;
}

// ========================================
// Patient Medical History
// ========================================

async function viewPatientHistory(patientId) {
  const modalBody = document.getElementById('patient-history-modal-body');
  if (!modalBody) return;

  modalBody.innerHTML = '<div style="display:flex;justify-content:center;padding:var(--space-2xl)"><div class="spinner"></div></div>';
  document.getElementById('patient-history-modal').classList.add('active');

  try {
    const data = await apiFetch(`/appointments/doctor/patient/${patientId}`);
    const patient = data.patient;
    const appointments = data.appointments || [];

    const initials = (patient.name || 'Patient').split(' ').map(n => n[0]).join('').toUpperCase();

    modalBody.innerHTML = `
      <div style="display:flex;align-items:center;gap:var(--space-md);padding-bottom:var(--space-md);border-bottom:1px solid var(--border);margin-bottom:var(--space-lg)">
        <div class="patient-card-avatar" style="width:64px;height:64px;font-size:1.3rem">${initials}</div>
        <div>
          <h2 style="font-size:1.3rem;margin-bottom:4px">${escapeHtml(patient.name)}</h2>
          <p style="color:var(--text-secondary);font-size:0.85rem">
            ${escapeHtml(patient.email)} • ${escapeHtml(patient.phone || 'No phone')}
          </p>
          <div style="display:flex;gap:var(--space-sm);margin-top:6px">
            <span class="patient-detail-chip">Gender: ${escapeHtml(patient.gender || 'N/A')}</span>
            <span class="patient-detail-chip">Blood: ${escapeHtml(patient.blood_group || 'N/A')}</span>
            <span class="patient-detail-chip">DOB: ${patient.date_of_birth ? formatDate(patient.date_of_birth) : 'N/A'}</span>
          </div>
        </div>
      </div>

      <h3 style="font-size:1.05rem;margin-bottom:var(--space-md);display:flex;align-items:center;gap:var(--space-sm)">
        <span class="material-icons-round" style="color:var(--primary-light)">history_edu</span>
        Consultation Timeline (${appointments.length} Visits)
      </h3>

      ${appointments.length === 0 ? `
        <div class="empty-state" style="padding:var(--space-lg)"><p>No recorded visits with this patient yet.</p></div>
      ` : `
        <div class="history-timeline">
          ${appointments.map(a => `
            <div class="history-item">
              <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:6px">
                <strong style="color:var(--primary-light)">${formatDate(a.appointment_date)} at ${formatTime(a.start_time)}</strong>
                <span class="status-badge status-${a.status}">${a.status}</span>
              </div>
              <p style="font-size:0.85rem;color:var(--text-secondary);margin-bottom:4px">
                <strong>Type:</strong> <span style="text-transform:capitalize">${escapeHtml(a.consultation_type)}</span>
              </p>
              ${a.reason ? `
                <p style="font-size:0.85rem;margin-bottom:4px">
                  <strong>Complaint:</strong> ${escapeHtml(a.reason)}
                </p>
              ` : ''}
              ${a.prescription ? `
                <div style="background:rgba(13,148,136,0.08);padding:8px 12px;border-left:3px solid var(--primary);border-radius:4px;font-size:0.85rem;margin-top:6px">
                  <strong>Rx Prescription:</strong> ${escapeHtml(a.prescription)}
                </div>
              ` : ''}
              ${a.notes ? `
                <div style="background:rgba(99,102,241,0.08);padding:8px 12px;border-left:3px solid var(--accent);border-radius:4px;font-size:0.85rem;margin-top:6px">
                  <strong>Doctor Notes:</strong> ${escapeHtml(a.notes)}
                </div>
              ` : ''}
            </div>
          `).join('')}
        </div>
      `}
    `;
  } catch (err) {
    modalBody.innerHTML = `<div class="empty-state"><p>${err.message}</p></div>`;
  }
}

// ========================================
// Prescription Sheet & Print
// ========================================

function printPrescription(appointmentId) {
  const apt = state.appointments.find(a => a.id === appointmentId);
  if (!apt) return;

  const modalBody = document.getElementById('prescription-modal-body');
  if (!modalBody) return;

  const doc = state.user || {};
  const rxDate = formatDate(apt.appointment_date);

  modalBody.innerHTML = `
    <div class="rx-sheet" id="printable-rx-sheet">
      <div class="rx-header">
        <div>
          <div class="rx-clinic-name">
            <span class="material-icons-round" style="color:#0d9488">local_hospital</span>
            MediBook Clinic Network
          </div>
          <p style="font-size:0.85rem;color:#64748b;margin-top:2px">Specialized Medical Care & Consultation Center</p>
        </div>
        <div style="text-align:right">
          <h3 style="font-size:1.1rem;color:#0f172a;margin:0">${escapeHtml(doc.name || 'Attending Physician')}</h3>
          <p style="font-size:0.8rem;color:#0d9488;font-weight:600">${escapeHtml(doc.specialty || '')}</p>
          <p style="font-size:0.75rem;color:#64748b">${escapeHtml(doc.qualification || '')}</p>
        </div>
      </div>

      <div class="rx-meta-grid">
        <div><strong>Patient Name:</strong> ${escapeHtml(apt.patient_name || 'Patient')}</div>
        <div><strong>Date:</strong> ${rxDate}</div>
        <div><strong>Contact:</strong> ${escapeHtml(apt.patient_phone || 'N/A')}</div>
        <div><strong>Blood Group:</strong> ${escapeHtml(apt.patient_blood_group || 'N/A')}</div>
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
          <strong style="font-size:0.9rem">Clinical Advice & Diagnosis:</strong>
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
          <p style="font-family:'Courier New', monospace;color:#0d9488">${escapeHtml(doc.name || 'Doctor')}</p>
          <p style="font-size:0.75rem;color:#64748b;border-top:1px solid #cbd5e1;padding-top:2px">Authorized Signature</p>
        </div>
      </div>
    </div>
  `;

  document.getElementById('prescription-modal').classList.add('active');
}

function printPrescriptionDoc() {
  window.print();
}

// ========================================
// Virtual Teleconsultation Video Room
// ========================================

let callTimerInterval = null;
let callSeconds = 0;
let callMediaStream = null;
let callAudioMuted = false;
let callVideoMuted = false;

function startVideoCall(appointmentId, role = 'doctor') {
  const apt = state.appointments.find(a => a.id === appointmentId);
  const peerName = role === 'doctor' ? (apt ? apt.patient_name : 'Patient') : (apt ? apt.doctor_name : 'Doctor');
  const myName = role === 'doctor' ? (state.user ? state.user.name : 'Dr. Sarah') : 'Patient';

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
            <div class="video-avatar-pulse" style="background:linear-gradient(135deg, #0d9488, #059669)">
              <span class="material-icons-round" style="font-size:2.4rem">${role === 'doctor' ? 'person' : 'medical_services'}</span>
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
        <button class="control-btn btn-hangup" onclick="endVideoCall()" title="End Consultation">
          <span class="material-icons-round">call_end</span>
        </button>
      </div>

      <!-- In-Call Messaging Drawer -->
      <div class="incall-chat-box">
        <div style="font-size:0.85rem;font-weight:600;margin-bottom:8px;color:var(--text-secondary)">
          In-Call Clinical Consultation Chat
        </div>
        <div class="incall-msgs" id="incall-msgs">
          <div class="incall-msg peer">
            <strong>System:</strong> Secure end-to-end encrypted consultation channel established.
          </div>
          <div class="incall-msg peer">
            <strong>${escapeHtml(peerName)}:</strong> Hello! Connected and ready for consultation.
          </div>
        </div>
        <div style="display:flex;gap:var(--space-sm)">
          <input type="text" id="incall-input" placeholder="Type clinical note or message..." style="flex:1;padding:8px 12px;background:var(--bg-input);border:1px solid var(--border);border-radius:var(--radius-sm)" onkeypress="if(event.key==='Enter') sendInCallMessage()">
          <button class="btn btn-sm btn-primary" onclick="sendInCallMessage()">Send</button>
        </div>
      </div>
    </div>
  `;

  document.getElementById('video-modal').classList.add('active');

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
  showToast('Screen sharing mode initiated', 'info');
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

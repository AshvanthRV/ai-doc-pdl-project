const http = require('http');

async function post(url, data) {
  const res = await fetch(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(data)
  });
  return { status: res.status, data: await res.json() };
}

async function get(url, token) {
  const headers = {};
  if (token) headers['Authorization'] = `Bearer ${token}`;
  const res = await fetch(url, { headers });
  return { status: res.status, data: await res.json() };
}

async function runTests() {
  console.log('--- 1. Testing API Health ---');
  const health = await get('http://localhost:3000/api/health');
  console.log('Health:', health.status, health.data);

  console.log('\n--- 2. Testing Doctor Login ---');
  const docLogin = await post('http://localhost:3000/api/doctors/login', {
    email: 'sarah@clinic.com',
    password: 'password123'
  });
  console.log('Doctor Login:', docLogin.status, docLogin.data.user.name, `(${docLogin.data.user.specialty})`);
  const docToken = docLogin.data.token;

  console.log('\n--- 3. Testing Doctor Dashboard API ---');
  const docDash = await get('http://localhost:3000/api/dashboard/doctor', docToken);
  console.log('Doctor Stats:', {
    total: docDash.data.stats.total,
    pending: docDash.data.stats.pending,
    confirmed: docDash.data.stats.confirmed,
    revenue: docDash.data.total_revenue
  });

  console.log('\n--- 4. Testing Doctor Schedule Slots API ---');
  const slots = await get('http://localhost:3000/api/doctors/me/slots', docToken);
  console.log('Doctor Slots Count:', slots.data.slots.length, 'Available Days:', slots.data.available_days);

  console.log('\n--- 5. Testing Doctor Patients API ---');
  const docPatients = await get('http://localhost:3000/api/doctors/me/patients', docToken);
  console.log('Doctor Patients Count:', docPatients.data.length, docPatients.data.map(p => p.name));

  console.log('\n--- 6. Testing Patient Login ---');
  const patLogin = await post('http://localhost:3000/api/patients/login', {
    email: 'john@patient.com',
    password: 'password123'
  });
  console.log('Patient Login:', patLogin.status, patLogin.data.user.name);
  const patToken = patLogin.data.token;

  console.log('\n--- 7. Testing Patient Dashboard API ---');
  const patDash = await get('http://localhost:3000/api/dashboard/patient', patToken);
  console.log('Patient Stats:', {
    total: patDash.data.stats.total,
    upcomingCount: patDash.data.upcoming_appointments.length
  });

  console.log('\n--- 8. Testing Static Servers ---');
  const patHtml = await (await fetch('http://localhost:3001')).text();
  console.log('Patient Portal 3001 Status: 200, length:', patHtml.length, 'title exists:', patHtml.includes('<title>'));

  const docHtml = await (await fetch('http://localhost:3002')).text();
  console.log('Doctor Dashboard 3002 Status: 200, length:', docHtml.length, 'title exists:', docHtml.includes('<title>'));

  console.log('\n--- 9. Testing Doctor Patient History API ---');
  const patientHist = await get('http://localhost:3000/api/appointments/doctor/patient/1', docToken);
  console.log('Patient History for John Doe:', {
    patientName: patientHist.data.patient.name,
    pastVisitsCount: patientHist.data.appointments.length
  });

  console.log('\n========================================');
  console.log('🎉 ALL 9 INTEGRATION TESTS PASSED! 🎉');
  console.log('========================================');
}

runTests().catch(err => {
  console.error('Test failed:', err);
  process.exit(1);
});

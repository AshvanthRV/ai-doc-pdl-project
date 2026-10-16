const express = require('express');
const router = express.Router();
const fs = require('fs');
const path = require('path');
const { getDb } = require('../db');
const { authenticateToken, authorizeRole } = require('../auth');

// Helper to get Gemini API Key
function getApiKey() {
  if (process.env.GEMINI_API_KEY && process.env.GEMINI_API_KEY.trim()) {
    return process.env.GEMINI_API_KEY.trim();
  }
  // Check .env files
  const envPaths = [
    path.join(__dirname, '..', '.env'),
    path.join(__dirname, '..', '..', '.env')
  ];
  for (const envPath of envPaths) {
    if (fs.existsSync(envPath)) {
      const content = fs.readFileSync(envPath, 'utf8');
      const match = content.match(/GEMINI_API_KEY\s*=\s*([^\r\n]+)/);
      if (match && match[1]) {
        process.env.GEMINI_API_KEY = match[1].trim();
        return process.env.GEMINI_API_KEY;
      }
    }
  }
  return '';
}

// Check AI status
router.get('/status', (req, res) => {
  const apiKey = getApiKey();
  res.json({
    configured: Boolean(apiKey),
    model: 'gemini-3.8-flash',
    provider: 'Google Gemini'
  });
});

// Update or set API Key
router.post('/config', authenticateToken, authorizeRole('doctor'), (req, res) => {
  const { apiKey } = req.body;
  if (!apiKey || !apiKey.trim()) {
    return res.status(400).json({ error: 'API key is required' });
  }

  process.env.GEMINI_API_KEY = apiKey.trim();
  // Keep user-supplied credentials in memory; never write secrets to project files.
  res.json({ message: 'Gemini API key updated successfully', configured: true });
});

// Call Google Gemini API with fallback
async function callGemini(promptText, apiKey, isJson = true) {
  const modelsToTry = ['gemini-3.8-flash', 'gemini-3.6-flash', 'gemini-3.5-flash-lite'];
  let lastError = null;

  for (const model of modelsToTry) {
    try {
      const url = `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${apiKey}`;

      const requestBody = {
        contents: [
          {
            parts: [
              { text: promptText }
            ]
          }
        ],
        generationConfig: {
          temperature: 0.2,
          maxOutputTokens: 2048
        }
      };

      if (isJson) {
        requestBody.generationConfig.responseMimeType = 'application/json';
      }

      const response = await fetch(url, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(requestBody)
      });

      if (!response.ok) {
        const errorData = await response.json().catch(() => ({}));
        lastError = new Error(errorData.error?.message || `Gemini ${model} error (Status ${response.status})`);
        continue;
      }

      const data = await response.json();
      const rawText = data.candidates?.[0]?.content?.parts?.[0]?.text;
      if (rawText) {
        return rawText;
      }
    } catch (err) {
      lastError = err;
    }
  }

  throw lastError || new Error('Failed to generate response from Gemini AI');
}

// Diagnose patient query & match doctors
router.post('/diagnose', authenticateToken, authorizeRole('patient'), async (req, res) => {
  try {
    const { query, patientInfo } = req.body;
    if (!query || !query.trim()) {
      return res.status(400).json({ error: 'Please describe your symptoms or medical concern' });
    }

    const apiKey = getApiKey();
    if (!apiKey) {
      return res.status(400).json({ error: 'Gemini API key is not configured on the server.' });
    }

    const db = getDb();
    const allDoctors = db.prepare(`
      SELECT id, name, email, specialty, qualification, experience_years, consultation_fee, bio, avatar_url, rating, total_reviews
      FROM doctors
    `).all();

    // Extract unique specialties from available doctors
    const availableSpecialties = Array.from(new Set(allDoctors.map(d => d.specialty)));

    const systemPrompt = `You are an expert AI clinical triage assistant powered by Google Gemini for the MediBook Healthcare platform.
A patient has provided their symptoms / medical concern. Your job is to:
1. Recognize the most likely condition / medical problem.
2. Determine severity and urgency level (choose from: "low", "moderate", "high", "emergency").
3. Extract key symptoms.
4. Recommend which medical specialties the patient should consult. Available specialties in the hospital are: ${JSON.stringify(availableSpecialties)}.
5. Provide a helpful, clear, empathetic clinical assessment for the patient.
6. Provide safe, practical pre-consultation comfort advice (non-prescriptive).
7. List 3 questions the patient should ask their doctor during consultation.
8. Provide detailed clinical doctor's briefing notes that the consulting physician can review during consultation (including differential diagnoses, key vitals/red flags to check, recommended diagnostic tests).

Patient context:
- Description / Query: "${query.replace(/"/g, '\\"')}"
${patientInfo ? `- Patient Demographics: Gender: ${patientInfo.gender || 'Not specified'}, Age/DOB: ${patientInfo.dob || 'Not specified'}` : ''}

You MUST return your response strictly as a JSON object adhering to this exact schema:
{
  "condition_name": "Recognized Condition Name (e.g. Suspected Acute Migraine, Hypertension Assessment, Dermatitis)",
  "urgency_level": "low" | "moderate" | "high" | "emergency",
  "urgency_label": "Short label (e.g. Routine Consultation, Priority Consultation, Urgent Care, Immediate Emergency Care)",
  "symptoms": ["Symptom 1", "Symptom 2", "Symptom 3"],
  "recommended_specialties": ["Specialty1", "Specialty2"],
  "clinical_assessment": "Clear, reassuring patient-facing explanation of the condition and why consultation is advised.",
  "pre_consultation_advice": "Safe self-care steps before seeing the doctor (e.g. hydration, rest, symptom journaling, avoiding triggers).",
  "questions_to_ask_doctor": [
    "Question 1 for doctor",
    "Question 2 for doctor",
    "Question 3 for doctor"
  ],
  "clinical_doctor_notes": "Professional medical briefing for the doctor to read at consultation time: probable differentials, physical examination focuses, and lab investigations to consider.",
  "is_emergency": true/false,
  "emergency_warning": "Warning text if emergency, otherwise null"
}`;

    const rawJson = await callGemini(systemPrompt, apiKey, true);
    let parsedDiagnosis;
    try {
      parsedDiagnosis = JSON.parse(rawJson);
    } catch (e) {
      // Fallback if formatting was slightly off
      const cleanJson = rawJson.replace(/```json/g, '').replace(/```/g, '').trim();
      parsedDiagnosis = JSON.parse(cleanJson);
    }

    // Match doctors in the database based on recommended specialties
    const recommendedSpecialties = (parsedDiagnosis.recommended_specialties || []).map(s => s.toLowerCase());
    
    // Score and sort doctors
    const scoredDoctors = allDoctors.map(doc => {
      let score = 0;
      const docSpecialty = (doc.specialty || '').toLowerCase();
      
      const specialtyIndex = recommendedSpecialties.findIndex(rs => docSpecialty.includes(rs) || rs.includes(docSpecialty));
      if (specialtyIndex !== -1) {
        score += (100 - specialtyIndex * 10);
      } else if (docSpecialty.includes('general') || docSpecialty.includes('internal')) {
        score += 30; // General physicians are good secondary options
      }

      score += (doc.rating || 4.5) * 5;
      score += Math.min(doc.experience_years || 0, 20);

      return { ...doc, matchScore: score };
    });

    // Filter to doctors with relevant specialty match or top general physicians
    const matchedDoctors = scoredDoctors
      .sort((a, b) => b.matchScore - a.matchScore)
      .slice(0, 4);

    res.json({
      success: true,
      query,
      diagnosis: parsedDiagnosis,
      matched_doctors: matchedDoctors,
      generated_at: new Date().toISOString()
    });

  } catch (err) {
    console.error('Diagnosis AI error:', err);
    res.status(500).json({ error: err.message || 'Failed to process medical diagnosis query with Gemini AI' });
  }
});

// Doctor consultation AI insight assistant
router.post('/doctor-insights', authenticateToken, authorizeRole('doctor'), async (req, res) => {
  try {
    const { appointmentId, patientCondition, symptoms, patientNotes } = req.body;
    const apiKey = getApiKey();
    if (!apiKey) {
      return res.status(400).json({ error: 'Gemini API key is not configured.' });
    }

    const db = getDb();
    let aptDetails = null;
    if (appointmentId) {
      aptDetails = db.prepare(`
        SELECT a.*, p.name as patient_name, p.gender, p.blood_group, p.date_of_birth
        FROM appointments a
        JOIN patients p ON a.patient_id = p.id
        WHERE a.id = ? AND a.doctor_id = ?
      `).get(appointmentId, req.user.id);
      if (!aptDetails) {
        return res.status(404).json({ error: 'Appointment not found' });
      }
    }

    const prompt = `You are a clinical decision support AI powered by Google Gemini assisting a licensed physician during patient consultation.
Provide a clinical consultation summary and recommendations for the doctor.

Patient Context:
- Patient Name: ${aptDetails?.patient_name || 'Patient'}
- Gender/Blood Group: ${aptDetails?.gender || 'N/A'}, Blood Group: ${aptDetails?.blood_group || 'N/A'}, DOB: ${aptDetails?.date_of_birth || 'N/A'}
- Primary Reported Condition: ${patientCondition || aptDetails?.patient_condition || 'Not specified'}
- Reported Symptoms: ${symptoms || aptDetails?.symptoms || 'Not specified'}
- Patient Reason for Visit: ${aptDetails?.reason || 'Not specified'}
- Prior Doctor Notes: ${patientNotes || aptDetails?.notes || 'None'}

Please provide concise clinical insights for the doctor in JSON format:
{
  "condition_summary": "Concise summary of patient condition and presentation",
  "differential_diagnoses": ["Differential 1", "Differential 2", "Differential 3"],
  "examination_focus": ["Specific physical exam check 1", "Specific physical exam check 2"],
  "recommended_investigations": ["Lab test or imaging 1", "Lab test or imaging 2"],
  "clinical_interview_questions": [
    "Targeted diagnostic question for the doctor to ask 1",
    "Targeted diagnostic question for the doctor to ask 2"
  ],
  "treatment_guidelines": "Key evidence-based pharmacological or non-pharmacological considerations"
}`;

    const rawJson = await callGemini(prompt, apiKey, true);
    let parsed;
    try {
      parsed = JSON.parse(rawJson);
    } catch (parseError) {
      parsed = JSON.parse(rawJson.replace(/```json/g, '').replace(/```/g, '').trim());
    }
    res.json({ success: true, insights: parsed });

  } catch (err) {
    console.error('Doctor AI insights error:', err);
    res.status(500).json({ error: err.message });
  }
});

module.exports = router;

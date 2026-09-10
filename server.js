require('dotenv').config();
const express = require('express');
const session = require('express-session');
const cors = require('cors');
const path = require('path');
const { v4: uuidv4 } = require('uuid');
const { db, initDB } = require('./db');
const { GoogleGenerativeAI } = require('@google/generative-ai');

const app = express();
const PORT = process.env.PORT || 3000;

// Init DB
initDB();

// Gemini client
const genAI = new GoogleGenerativeAI(process.env.GEMINI_API_KEY);
const geminiModel = genAI.getGenerativeModel({ model: process.env.GEMINI_MODEL || 'gemini-3.6-flash' });

app.use(express.json());
app.use(cors({ origin: true, credentials: true }));
app.use(express.static(path.join(__dirname, 'public')));

// Session middleware
app.use(session({
  secret: process.env.SESSION_SECRET || 'ibbi_secret_2025',
  resave: false,
  saveUninitialized: true,
  cookie: { maxAge: 7 * 24 * 60 * 60 * 1000 } // 7 days
}));

// Ensure session has an ID
app.use((req, res, next) => {
  if (!req.session.userId) {
    req.session.userId = uuidv4();
    db.prepare('INSERT OR IGNORE INTO users (id, name) VALUES (?, ?)').run(req.session.userId, 'Guest User');
    db.prepare('INSERT OR IGNORE INTO sessions (id, user_id) VALUES (?, ?)').run(req.session.userId, req.session.userId);
  }
  next();
});

// ─── SYLLABUS DATA ───────────────────────────────────────────────────────────
const SYLLABUS = [
  { topic: 'IBC', weight: 4, subtopics: ['CIRP Initiation','Moratorium','Committee of Creditors','Resolution Plan','Liquidation','Pre-Pack (PPIRP)','Individual Insolvency','Cross-border Insolvency','Avoidance Transactions','Voluntary Liquidation'] },
  { topic: 'Rules & Regulations', weight: 6, subtopics: ['IBBI (CIRP) Regulations','IBBI (Liquidation Process) Regulations','IBBI (IP) Regulations','IBBI (IPA) Regulations','IBBI (Voluntary Liquidation) Regulations','IBBI (Pre-Pack) Regulations','IBBI (Grievance) Regulations','IBBI (Model Bye-Laws) Regulations'] },
  { topic: 'Business Laws', weight: 4, subtopics: ['Companies Act 2013','Contract Act 1872','Transfer of Property Act 1882','Sale of Goods Act 1930','Partnership Act 1932','LLP Act 2008'] },
  { topic: 'General Laws', weight: 7, subtopics: ['SARFAESI Act 2002','RDDBFI Act 1993','Prevention of Fraud (SFIO)','Competition Act 2002','FEMA','Income Tax (IBC context)','Stamp Act'] },
  { topic: 'Finance & Accounts', weight: 2, subtopics: ['Financial Statements Analysis','Valuation Principles','Corporate Finance Basics','Accounting Standards (IBC context)'] },
  { topic: 'General Awareness', weight: 2, subtopics: ['IBBI','Insolvency Ecosystem','Recent Amendments','Key Statistics'] },
  { topic: 'Case Laws', weight: 5, subtopics: ['Supreme Court','High Court','NCLAT','NCLT'] },
  { topic: 'Case Studies', weight: 70, subtopics: ['CIRP Case Studies','Liquidation Case Studies','Pre-Pack Case Studies','Individual Insolvency Cases','Ethics & Professional Conduct','Business Laws Application','Cross-topic Application'] },
];

// ─── API ROUTES ───────────────────────────────────────────────────────────────

// GET syllabus
app.get('/api/syllabus', (req, res) => {
  const sid = req.session.userId;
  const topicStats = db.prepare(`
    SELECT topic, COUNT(*) as attempts, SUM(is_correct) as correct,
    ROUND(100.0 * SUM(is_correct) / COUNT(*), 1) as accuracy
    FROM attempts WHERE session_id = ? GROUP BY topic
  `).all(sid);
  
  const statsMap = {};
  topicStats.forEach(ts => statsMap[ts.topic] = ts);

  const enriched = SYLLABUS.map(s => {
    const stat = statsMap[s.topic] || { attempts: 0, correct: 0, accuracy: 0 };
    return {
      ...s,
      attempts: stat.attempts,
      correct: stat.correct,
      accuracy: stat.accuracy
    };
  });
  res.json(enriched);
});

// GET questions by topic/subtopic
app.get('/api/questions', (req, res) => {
  const { topic, subtopic, difficulty, limit = 10, exclude } = req.query;
  let sql = 'SELECT * FROM questions WHERE 1=1';
  const params = [];
  if (topic) { sql += ' AND topic = ?'; params.push(topic); }
  if (subtopic) { sql += ' AND subtopic = ?'; params.push(subtopic); }
  if (difficulty) { sql += ' AND difficulty = ?'; params.push(parseInt(difficulty)); }
  if (exclude) {
    const ids = exclude.split(',').map(Number).filter(Boolean);
    if (ids.length) sql += ` AND id NOT IN (${ids.map(() => '?').join(',')})`;
    params.push(...ids);
  }
  sql += ' ORDER BY RANDOM() LIMIT ?';
  params.push(parseInt(limit));
  const questions = db.prepare(sql).all(...params);
  // Don't send correct_answer to client
  const safe = questions.map(q => ({ ...q, correct_answer: undefined }));
  res.json(safe);
});

// POST submit answer (server-side scoring)
app.post('/api/answer', (req, res) => {
  const { question_id, selected_answer, mock_id, time_taken } = req.body;
  const sessionId = req.session.userId;

  const question = db.prepare('SELECT * FROM questions WHERE id = ?').get(question_id);
  if (!question) return res.status(404).json({ error: 'Question not found' });

  const is_correct = selected_answer === question.correct_answer ? 1 : 0;
  let marks_earned = 0;
  if (selected_answer) {
    marks_earned = is_correct ? question.marks : -(question.marks * 0.25);
  }

  const error_type = !is_correct && selected_answer ? detectErrorType(question, selected_answer) : null;

  db.prepare(`
    INSERT INTO attempts (session_id, question_id, mock_id, selected_answer, is_correct, marks_earned, time_taken, topic, subtopic, difficulty, error_type)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `).run(sessionId, question_id, mock_id || null, selected_answer, is_correct, marks_earned, time_taken || 0, question.topic, question.subtopic, question.difficulty, error_type);

  // Update weak areas
  updateWeakArea(sessionId, question, is_correct, error_type);

  res.json({
    correct: is_correct === 1,
    correct_answer: question.correct_answer,
    explanation: question.explanation,
    marks_earned,
    error_type
  });
});

function detectErrorType(question, selected) {
  // Enhanced error detection based on multiple factors
  const topic = question.topic.toLowerCase();
  const subtopic = question.subtopic ? question.subtopic.toLowerCase() : '';
  const tags = question.tags ? question.tags.toLowerCase() : '';
  
  // Case law specific weakness
  if (topic.includes('case law') || tags.includes('caselaw') || topic.includes('case studies')) {
    return 'case_law_recall';
  }
  
  // Section/provision recall weakness
  if (question.question.toLowerCase().includes('section') || tags.includes('section')) {
    return 'provision_recall';
  }
  
  // Application/scenario weakness for case studies
  if (question.difficulty === 3 || topic.includes('case studies')) {
    return 'application';
  }
  
  // Conceptual weakness for medium difficulty
  if (question.difficulty === 2) {
    return 'conceptual';
  }
  
  // Factual weakness for basic questions
  if (question.difficulty === 1) {
    return 'factual';
  }
  
  // Numerical/calculation weakness
  if (question.question.toLowerCase().includes('calculate') || question.question.toLowerCase().includes('rs.') || question.question.toLowerCase().includes('crore')) {
    return 'calculation';
  }
  
  // Default to application for complex questions
  return 'application';
}

function updateWeakArea(sessionId, question, is_correct, error_type) {
  try {
    const existing = db.prepare('SELECT * FROM weak_areas WHERE session_id = ? AND topic = ? AND subtopic = ?')
      .get(sessionId, question.topic, question.subtopic || '');
    
    if (existing) {
      const newCorrect = existing.correct + (is_correct ? 1 : 0);
      const newAttempts = existing.attempts + 1;
      const score = Math.round((newCorrect / newAttempts) * 100);
      
      // Track consecutive errors to identify persistent weaknesses
      const consecutiveErrors = is_correct ? 0 : (existing.consecutive_errors || 0) + 1;
      
      // Determine weakness type based on pattern
      let weaknessType = error_type || existing.weakness_type;
      if (consecutiveErrors >= 3 && score < 40) {
        weaknessType = 'critical_' + weaknessType;
      }
      
      db.prepare('UPDATE weak_areas SET attempts = ?, correct = ?, score = ?, weakness_type = ?, consecutive_errors = ?, last_updated = strftime(\'%s\',\'now\') WHERE id = ?')
        .run(newAttempts, newCorrect, score, weaknessType, consecutiveErrors, existing.id);
    } else {
      db.prepare('INSERT INTO weak_areas (session_id, topic, subtopic, weakness_type, score, attempts, correct, consecutive_errors) VALUES (?, ?, ?, ?, ?, 1, ?, ?)')
        .run(sessionId, question.topic, question.subtopic || '', error_type || 'unknown', is_correct ? 100 : 0, is_correct ? 1 : 0, is_correct ? 0 : 1);
    }
  } catch (error) {
    console.error('Error updating weak area:', error);
  }
}

// ─── MOCK TEST ROUTES ────────────────────────────────────────────────────────

function getNonRepeatingQuestions(sessionId, conditionSql, params, limit) {
  // 1. Prioritize questions that the user has NEVER attempted
  let sql1 = `SELECT id, marks FROM questions WHERE ${conditionSql} AND id NOT IN (SELECT question_id FROM attempts WHERE session_id = ?) ORDER BY RANDOM() LIMIT ?`;
  let qs = db.prepare(sql1).all(...params, sessionId, limit);

  // 2. If pool is exhausted, backfill with least-recently attempted questions
  if (qs.length < limit) {
    const needed = limit - qs.length;
    const excludeIds = qs.map(q => q.id);
    let excludeClause = excludeIds.length ? `AND id NOT IN (${excludeIds.map(() => '?').join(',')})` : '';
    let sql2 = `SELECT id, marks FROM questions WHERE ${conditionSql} ${excludeClause} ORDER BY (SELECT COALESCE(MAX(created_at), 0) FROM attempts WHERE question_id = questions.id AND session_id = ?) ASC, RANDOM() LIMIT ?`;
    let backfill = db.prepare(sql2).all(...params, ...excludeIds, sessionId, needed);
    qs = qs.concat(backfill);
  }
  return qs;
}

function buildFullMock(sessionId) {
  const result = [];
  // Case Studies: ~10 questions × 4 marks = 40 marks
  result.push(...getNonRepeatingQuestions(sessionId, "topic = 'Case Studies'", [], 10));
  // IBC: 6 questions
  result.push(...getNonRepeatingQuestions(sessionId, "topic = 'IBC'", [], 6));
  // Rules & Regulations: 4 questions
  result.push(...getNonRepeatingQuestions(sessionId, "topic = 'Rules & Regulations'", [], 4));
  // Business Laws: 3 questions
  result.push(...getNonRepeatingQuestions(sessionId, "topic = 'Business Laws'", [], 3));
  // General Laws: 3 questions
  result.push(...getNonRepeatingQuestions(sessionId, "topic = 'General Laws'", [], 3));
  // Finance & Accounts / General Awareness: 3 questions
  result.push(...getNonRepeatingQuestions(sessionId, "topic IN ('Finance & Accounts','General Awareness')", [], 3));
  
  // Shuffle order
  return result.sort(() => Math.random() - 0.5);
}

function buildCaseLawQuiz(sessionId, n) {
  return getNonRepeatingQuestions(sessionId, "topic IN ('IBC') AND tags LIKE '%CaseLaw%'", [], n);
}

app.post('/api/mock/start', (req, res) => {
  const { type = 'full', topic, num_questions } = req.body;
  const sessionId = req.session.userId;
  const mockId = uuidv4();

  let questions = [];
  const duration = type === 'full' ? 7200 : (type === 'quick' ? 1800 : 3600);

  if (type === 'full') {
    questions = buildFullMock(sessionId);
  } else if (type === 'topic' && topic) {
    questions = getNonRepeatingQuestions(sessionId, 'topic = ?', [topic], num_questions || 15);
  } else if (type === 'case-study') {
    questions = getNonRepeatingQuestions(sessionId, "topic = 'Case Studies'", [], num_questions || 10);
  } else if (type === 'case-law') {
    questions = buildCaseLawQuiz(sessionId, num_questions || 10);
  } else {
    // Quick test: 15 questions, non-repeating across all topics
    questions = getNonRepeatingQuestions(sessionId, '1=1', [], num_questions || 15);
  }

  if (questions.length === 0) return res.status(400).json({ error: 'No questions available' });

  const maxMarks = questions.reduce((s, q) => s + (q.marks || 1), 0);

  db.prepare(`INSERT INTO mocks (id, session_id, type, status, questions, start_time, duration, max_marks)
    VALUES (?, ?, ?, 'active', ?, strftime('%s','now'), ?, ?)`)
    .run(mockId, sessionId, type, JSON.stringify(questions.map(q => q.id)), duration, maxMarks);

  // Fetch full question data (without answers)
  const fullQuestions = questions.map(q => {
    const full = db.prepare('SELECT id, topic, subtopic, difficulty, type, question, option_a, option_b, option_c, option_d, marks FROM questions WHERE id = ?').get(q.id);
    return full;
  }).filter(Boolean);

  res.json({ mock_id: mockId, questions: fullQuestions, duration, max_marks: maxMarks, type });
});

// GET mock state (survives refresh)
app.get('/api/mock/:mockId', (req, res) => {
  const mock = db.prepare('SELECT * FROM mocks WHERE id = ? AND session_id = ?')
    .get(req.params.mockId, req.session.userId);
  if (!mock) return res.status(404).json({ error: 'Mock not found' });

  const questionIds = JSON.parse(mock.questions);
  const answers = JSON.parse(mock.answers || '{}');
  
  const questions = questionIds.map(id => {
    const q = db.prepare('SELECT id, topic, subtopic, difficulty, type, question, option_a, option_b, option_c, option_d, marks FROM questions WHERE id = ?').get(id);
    return q;
  }).filter(Boolean);

  const elapsed = mock.start_time ? Math.floor(Date.now()/1000) - mock.start_time : 0;
  const remaining = Math.max(0, mock.duration - elapsed);

  res.json({ ...mock, questions, answers, remaining, elapsed });
});

// POST submit mock answer
app.post('/api/mock/:mockId/answer', (req, res) => {
  const { question_id, selected_answer, time_taken } = req.body;
  const sessionId = req.session.userId;
  const mock = db.prepare('SELECT * FROM mocks WHERE id = ? AND session_id = ?').get(req.params.mockId, sessionId);
  
  if (!mock) return res.status(404).json({ error: 'Mock not found' });
  if (mock.status !== 'active') return res.status(400).json({ error: 'Mock is not active' });

  // Check time
  const elapsed = Math.floor(Date.now()/1000) - mock.start_time;
  if (elapsed > mock.duration) return res.status(400).json({ error: 'Time expired' });

  const answers = JSON.parse(mock.answers || '{}');
  if (answers[question_id] !== undefined) return res.json({ already_answered: true });

  answers[question_id] = selected_answer;
  db.prepare('UPDATE mocks SET answers = ? WHERE id = ?').run(JSON.stringify(answers), mock.id);

  // Record attempt
  const question = db.prepare('SELECT * FROM questions WHERE id = ?').get(question_id);
  if (question) {
    const is_correct = selected_answer === question.correct_answer ? 1 : 0;
    let marks_earned = 0;
    if (selected_answer) {
      marks_earned = is_correct ? question.marks : -(question.marks * 0.25);
    }
    const error_type = !is_correct && selected_answer ? detectErrorType(question, selected_answer) : null;
    
    db.prepare(`INSERT INTO attempts (session_id, question_id, mock_id, selected_answer, is_correct, marks_earned, time_taken, topic, subtopic, difficulty, error_type)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`)
      .run(sessionId, question_id, mock.id, selected_answer, is_correct, marks_earned, time_taken || 0, question.topic, question.subtopic, question.difficulty, error_type);
    
    updateWeakArea(sessionId, question, is_correct, error_type);
  }

  res.json({ saved: true, answered: Object.keys(answers).length });
});

// POST finish mock
app.post('/api/mock/:mockId/finish', (req, res) => {
  const sessionId = req.session.userId;
  const mock = db.prepare('SELECT * FROM mocks WHERE id = ? AND session_id = ?').get(req.params.mockId, sessionId);
  if (!mock) return res.status(404).json({ error: 'Mock not found' });

  const answers = JSON.parse(mock.answers || '{}');
  const questionIds = JSON.parse(mock.questions);
  let totalMarks = 0;
  const details = [];

  for (const qId of questionIds) {
    const question = db.prepare('SELECT * FROM questions WHERE id = ?').get(qId);
    if (!question) continue;
    const selected = answers[qId] !== undefined ? answers[qId] : null;
    let marks = 0;
    const is_correct = selected === question.correct_answer;
    if (selected) {
      marks = is_correct ? question.marks : -(question.marks * 0.25);
    } else {
      // Record unattempted question so it does not repeat immediately in consecutive tests
      db.prepare(`INSERT INTO attempts (session_id, question_id, mock_id, selected_answer, is_correct, marks_earned, time_taken, topic, subtopic, difficulty, error_type)
        VALUES (?, ?, ?, NULL, 0, 0, 0, ?, ?, ?, 'unattempted')`)
        .run(sessionId, qId, mock.id, question.topic, question.subtopic, question.difficulty);
    }
    totalMarks += marks;
    details.push({
      id: qId,
      topic: question.topic,
      subtopic: question.subtopic,
      question: question.question,
      option_a: question.option_a,
      option_b: question.option_b,
      option_c: question.option_c,
      option_d: question.option_d,
      correct: is_correct,
      marks_earned: parseFloat(marks.toFixed(2)),
      marks: question.marks,
      selected: selected,
      correct_answer: question.correct_answer,
      explanation: question.explanation
    });
  }

  // Ensure totalMarks is formatted
  const finalTotalMarks = Math.max(0, parseFloat(totalMarks.toFixed(2)));

  db.prepare('UPDATE mocks SET status = \'completed\', end_time = strftime(\'%s\',\'now\'), total_marks = ? WHERE id = ?')
    .run(finalTotalMarks, mock.id);

  const correctCount = details.filter(d => d.selected && d.correct).length;
  const incorrectCount = details.filter(d => d.selected && !d.correct).length;
  const unattemptedCount = details.filter(d => !d.selected).length;
  const positiveMarks = details.reduce((sum, d) => sum + (d.selected && d.correct ? d.marks_earned : 0), 0);
  const negativeMarks = details.reduce((sum, d) => sum + (d.selected && !d.correct ? Math.abs(d.marks_earned) : 0), 0);

  res.json({
    total_marks: finalTotalMarks,
    max_marks: mock.max_marks,
    percentage: ((finalTotalMarks / mock.max_marks) * 100).toFixed(1),
    correct_count: correctCount,
    incorrect_count: incorrectCount,
    unattempted_count: unattemptedCount,
    positive_marks: parseFloat(positiveMarks.toFixed(2)),
    negative_marks: parseFloat(negativeMarks.toFixed(2)),
    details
  });
});

// ─── DASHBOARD ───────────────────────────────────────────────────────────────

app.get('/api/dashboard', (req, res) => {
  const sid = req.session.userId;

  const totalAttempts = db.prepare('SELECT COUNT(*) as c FROM attempts WHERE session_id = ?').get(sid).c;
  const correctAttempts = db.prepare('SELECT COUNT(*) as c FROM attempts WHERE session_id = ? AND is_correct = 1').get(sid).c;
  const totalMarks = db.prepare('SELECT COALESCE(SUM(marks_earned),0) as s FROM attempts WHERE session_id = ?').get(sid).s;
  const mocksDone = db.prepare('SELECT COUNT(*) as c FROM mocks WHERE session_id = ? AND status = \'completed\'').get(sid).c;

  const topicPerf = db.prepare(`
    SELECT topic, COUNT(*) as attempts, SUM(is_correct) as correct, 
    ROUND(100.0 * SUM(is_correct) / COUNT(*), 1) as accuracy
    FROM attempts WHERE session_id = ? GROUP BY topic ORDER BY accuracy ASC
  `).all(sid);

  const weakAreas = db.prepare(`
    SELECT topic, subtopic, score, attempts, weakness_type 
    FROM weak_areas WHERE session_id = ? AND attempts >= 1 ORDER BY score ASC LIMIT 8
  `).all(sid);

  const recentMocks = db.prepare(`
    SELECT id, type, total_marks, max_marks, status, created_at,
    ROUND(100.0 * total_marks / max_marks, 1) as percentage
    FROM mocks WHERE session_id = ? ORDER BY created_at DESC LIMIT 5
  `).all(sid);

  const examDate = new Date('2025-06-15'); // estimated exam date
  const daysLeft = Math.max(0, Math.ceil((examDate - new Date()) / (1000 * 60 * 60 * 24)));

  res.json({
    total_attempts: totalAttempts,
    correct_attempts: correctAttempts,
    accuracy: totalAttempts > 0 ? ((correctAttempts / totalAttempts) * 100).toFixed(1) : 0,
    total_marks_earned: parseFloat(totalMarks.toFixed(2)),
    mocks_completed: mocksDone,
    topic_performance: topicPerf,
    weak_areas: weakAreas,
    recent_mocks: recentMocks,
    days_to_exam: daysLeft,
    readiness: calcReadiness(correctAttempts, totalAttempts, weakAreas)
  });
});

function calcReadiness(correct, total, weakAreas) {
  if (total < 10) return 'Insufficient Data';
  const accuracy = (correct / total) * 100;
  const criticalWeaks = weakAreas.filter(w => w.score < 50).length;
  if (accuracy >= 75 && criticalWeaks === 0) return 'Exam Ready';
  if (accuracy >= 60 && criticalWeaks <= 2) return 'Almost Ready';
  if (accuracy >= 45) return 'Needs Improvement';
  return 'Significant Gaps';
}

// ─── CASE LAWS ───────────────────────────────────────────────────────────────

app.get('/api/case-laws', (req, res) => {
  const { search, topic } = req.query;
  let sql = 'SELECT * FROM case_laws WHERE 1=1';
  const params = [];
  if (search) {
    sql += ' AND (case_name LIKE ? OR facts LIKE ? OR exam_principle LIKE ?)';
    params.push(`%${search}%`, `%${search}%`, `%${search}%`);
  }
  if (topic) { sql += ' AND topic = ?'; params.push(topic); }
  sql += ' ORDER BY year DESC';
  res.json(db.prepare(sql).all(...params));
});

app.get('/api/case-laws/:id', (req, res) => {
  const cl = db.prepare('SELECT * FROM case_laws WHERE id = ?').get(req.params.id);
  if (!cl) return res.status(404).json({ error: 'Not found' });
  res.json(cl);
});

// ─── CASE STUDIES ────────────────────────────────────────────────────────────

app.get('/api/case-studies', (req, res) => {
  const sid = req.session.userId;
  const studies = db.prepare('SELECT id, title, scenario, topic, difficulty FROM case_studies ORDER BY id').all();
  const enriched = studies.map(s => {
    const totalQs = db.prepare('SELECT count(*) as c FROM case_study_questions WHERE case_study_id = ?').get(s.id).c;
    const qIds = db.prepare('SELECT id FROM case_study_questions WHERE case_study_id = ?').all(s.id).map(x => x.id);
    let attemptedCount = 0;
    let correctCount = 0;
    let marksEarned = 0;
    if (qIds.length) {
      const attempts = db.prepare(`SELECT is_correct, marks_earned FROM attempts WHERE session_id = ? AND question_id IN (${qIds.map(() => '?').join(',')})`).all(sid, ...qIds);
      attemptedCount = attempts.length;
      correctCount = attempts.filter(a => a.is_correct === 1).length;
      marksEarned = attempts.reduce((sum, a) => sum + (a.marks_earned || 0), 0);
    }
    return {
      ...s,
      total_questions: totalQs,
      max_marks: totalQs * 4,
      attempted_questions: attemptedCount,
      correct_questions: correctCount,
      marks_earned: parseFloat(marksEarned.toFixed(2))
    };
  });
  res.json(enriched);
});

app.get('/api/case-studies/:id', (req, res) => {
  const sid = req.session.userId;
  const cs = db.prepare('SELECT * FROM case_studies WHERE id = ?').get(req.params.id);
  if (!cs) return res.status(404).json({ error: 'Not found' });
  const questions = db.prepare('SELECT id, question, option_a, option_b, option_c, option_d, marks FROM case_study_questions WHERE case_study_id = ?').all(cs.id);
  
  // Attach previous attempt info if candidate already answered
  const enrichedQuestions = questions.map(q => {
    const attempt = db.prepare('SELECT selected_answer, is_correct, marks_earned FROM attempts WHERE session_id = ? AND question_id = ? ORDER BY created_at DESC LIMIT 1').get(sid, q.id);
    return {
      ...q,
      user_answer: attempt ? attempt.selected_answer : null,
      is_correct: attempt ? (attempt.is_correct === 1) : null,
      marks_earned: attempt ? attempt.marks_earned : null
    };
  });
  res.json({ ...cs, questions: enrichedQuestions });
});

app.post('/api/case-studies/:id/answer', (req, res) => {
  const { question_id, selected_answer } = req.body;
  const sessionId = req.session.userId;
  const q = db.prepare('SELECT * FROM case_study_questions WHERE id = ?').get(question_id);
  if (!q) return res.status(404).json({ error: 'Not found' });
  
  const is_correct = selected_answer === q.correct_answer ? 1 : 0;
  const marks = is_correct ? q.marks : -(q.marks * 0.25);

  const cs = db.prepare('SELECT * FROM case_studies WHERE id = ?').get(req.params.id);
  const topicName = 'Case Studies';
  const subtopicName = cs ? cs.title : 'CIRP Case Studies';

  db.prepare(`INSERT INTO attempts (session_id, question_id, selected_answer, is_correct, marks_earned, topic, subtopic, difficulty, error_type)
    VALUES (?, ?, ?, ?, ?, ?, ?, 3, ?)`)
    .run(sessionId, question_id, selected_answer, is_correct, marks, topicName, subtopicName, is_correct ? null : 'application');

  updateWeakArea(sessionId, { topic: topicName, subtopic: subtopicName, difficulty: 3 }, is_correct, 'application');

  res.json({ correct: is_correct === 1, correct_answer: q.correct_answer, explanation: q.explanation, marks_earned: marks });
});

// ─── WEAK AREAS ──────────────────────────────────────────────────────────────

app.get('/api/weak-areas', (req, res) => {
  const sid = req.session.userId;
  const areas = db.prepare(`
    SELECT topic, subtopic, score, attempts, correct, weakness_type, last_updated
    FROM weak_areas WHERE session_id = ? ORDER BY score ASC
  `).all(sid);
  res.json(areas);
});

// GET practice questions for weak areas
app.get('/api/weak-areas/practice', (req, res) => {
  const sid = req.session.userId;
  const weakTopics = db.prepare('SELECT topic, subtopic, weakness_type, consecutive_errors, score FROM weak_areas WHERE session_id = ? AND score < 60 ORDER BY score ASC, consecutive_errors DESC LIMIT 5').all(sid);
  
  if (weakTopics.length === 0) {
    // Random questions if no weak areas identified
    const qs = db.prepare('SELECT id, topic, subtopic, difficulty, type, question, option_a, option_b, option_c, option_d, marks FROM questions ORDER BY RANDOM() LIMIT 5').all();
    return res.json(qs);
  }

  const questions = [];
  for (const wt of weakTopics) {
    // Get more questions for critical weaknesses (consecutive errors >= 3)
    const limit = wt.consecutive_errors >= 3 ? 5 : 3;
    
    // Adaptive difficulty: if score is very low, start with easier questions
    let sql = 'SELECT id, topic, subtopic, difficulty, type, question, option_a, option_b, option_c, option_d, marks FROM questions WHERE topic = ?';
    const params = [wt.topic];
    
    if (wt.score < 30) {
      sql += ' AND difficulty <= 2';
    } else if (wt.score < 50) {
      sql += ' AND difficulty <= 3';
    }
    
    sql += ' ORDER BY RANDOM() LIMIT ?';
    params.push(limit);
    
    const qs = db.prepare(sql).all(...params);
    questions.push(...qs);
  }
  res.json(questions.slice(0, 10));
});

// GET adaptive study recommendations
app.get('/api/study/recommendations', (req, res) => {
  const sid = req.session.userId;
  const weakAreas = db.prepare('SELECT topic, subtopic, weakness_type, score, consecutive_errors FROM weak_areas WHERE session_id = ? AND score < 60 ORDER BY score ASC, consecutive_errors DESC LIMIT 3').all(sid);
  
  const recommendations = [];
  
  for (const wa of weakAreas) {
    let recommendation = '';
    let priority = 'medium';
    
    if (wa.consecutive_errors >= 3 || wa.score < 30) {
      priority = 'high';
    }
    
    // Generate specific recommendations based on weakness type
    switch (wa.weakness_type) {
      case 'case_law_recall':
        recommendation = `Review key case laws for ${wa.topic}. Focus on case names, court, year, and exam principles. Use the Case Laws tab for targeted study.`;
        break;
      case 'provision_recall':
        recommendation = `Memorize key sections and provisions for ${wa.topic}. Create section-wise notes and practice recall. Focus on ${wa.subtopic || 'core provisions'}.`;
        break;
      case 'application':
        recommendation = `Practice scenario-based questions for ${wa.topic}. Focus on applying provisions to real-world situations. Case studies will help improve application skills.`;
        break;
      case 'conceptual':
        recommendation = `Strengthen conceptual understanding of ${wa.topic}. Study the underlying principles and logic behind provisions. Review case laws that explain concepts.`;
        break;
      case 'factual':
        recommendation = `Review basic facts and definitions for ${wa.topic}. Create flashcards for key terms, definitions, and procedural aspects.`;
        break;
      case 'calculation':
        recommendation = `Practice numerical problems for ${wa.topic}. Focus on liquidation waterfall calculations, time limits, and quantitative aspects.`;
        break;
      default:
        recommendation = `Practice more questions on ${wa.topic} ${wa.subtopic ? 'specifically ' + wa.subtopic : ''}. Review explanations for wrong answers.`;
    }
    
    recommendations.push({
      topic: wa.topic,
      subtopic: wa.subtopic,
      weakness_type: wa.weakness_type,
      score: wa.score,
      priority,
      recommendation
    });
  }
  
  // If no weak areas, provide general recommendations
  if (recommendations.length === 0) {
    const totalAttempts = db.prepare('SELECT COUNT(*) as c FROM attempts WHERE session_id = ?').get(sid).c;
    if (totalAttempts < 20) {
      recommendations.push({
        topic: 'General',
        subtopic: 'Foundation',
        weakness_type: 'insufficient_data',
        score: 0,
        priority: 'low',
        recommendation: 'Complete more questions across all topics to establish a baseline and identify your strengths and weaknesses.'
      });
    } else {
      recommendations.push({
        topic: 'General',
        subtopic: 'Maintenance',
        weakness_type: 'good_performance',
        score: 100,
        priority: 'low',
        recommendation: 'Your performance is good! Focus on maintaining accuracy across all topics and take full mock tests to build exam stamina.'
      });
    }
  }
  
  res.json(recommendations);
});

// ─── HISTORY ─────────────────────────────────────────────────────────────────

app.get('/api/history', (req, res) => {
  const sid = req.session.userId;
  const attempts = db.prepare(`
    SELECT a.*, q.question, q.topic, q.subtopic 
    FROM attempts a LEFT JOIN questions q ON a.question_id = q.id
    WHERE a.session_id = ? ORDER BY a.created_at DESC LIMIT 50
  `).all(sid);
  res.json(attempts);
});

// ─── AI CHAT ─────────────────────────────────────────────────────────────────

app.post('/api/chat', async (req, res) => {
  const { message } = req.body;
  const sessionId = req.session.userId;
  
  if (!message || !message.trim()) return res.status(400).json({ error: 'Message required' });

  // Save user message
  db.prepare('INSERT INTO conversations (session_id, role, content) VALUES (?, ?, ?)').run(sessionId, 'user', message);

  // Load recent conversation history (last 12 messages)
  const history = db.prepare('SELECT role, content FROM conversations WHERE session_id = ? ORDER BY created_at DESC LIMIT 12').all(sessionId).reverse();

  // Build context about the user
  const totalAttempts = db.prepare('SELECT COUNT(*) as c FROM attempts WHERE session_id = ?').get(sessionId).c;
  const accuracy = totalAttempts > 0 ? 
    ((db.prepare('SELECT COUNT(*) as c FROM attempts WHERE session_id = ? AND is_correct = 1').get(sessionId).c / totalAttempts) * 100).toFixed(1) : 0;
  const weakAreas = db.prepare('SELECT topic, subtopic, score, weakness_type, consecutive_errors FROM weak_areas WHERE session_id = ? AND score < 60 ORDER BY score ASC, consecutive_errors DESC LIMIT 5').all(sessionId);
  const recentMock = db.prepare('SELECT total_marks, max_marks FROM mocks WHERE session_id = ? AND status = \'completed\' ORDER BY created_at DESC LIMIT 1').get(sessionId);

  // Get topic performance
  const topicPerf = db.prepare(`
    SELECT topic, COUNT(*) as attempts, SUM(is_correct) as correct, 
    ROUND(100.0 * SUM(is_correct) / COUNT(*), 1) as accuracy
    FROM attempts WHERE session_id = ? GROUP BY topic ORDER BY accuracy ASC
  `).all(sessionId);

  // Get recent study progress
  const recentStudy = db.prepare('SELECT topic, subtopic, status, last_studied FROM study_progress WHERE session_id = ? ORDER BY last_studied DESC LIMIT 3').all(sessionId);

  const userContext = `
USER PERFORMANCE ANALYSIS:
- Total attempts: ${totalAttempts} questions
- Overall accuracy: ${accuracy}%
- Recent mock: ${recentMock ? `${recentMock.type} - ${recentMock.total_marks}/${recentMock.max_marks} marks (${((recentMock.total_marks/recentMock.max_marks)*100).toFixed(1)}%)` : 'No mocks completed yet'}

TOPIC PERFORMANCE (sorted by accuracy):
${topicPerf.map(t => `- ${t.topic}: ${t.accuracy}% (${t.correct}/${t.attempts} correct)`).join('\n')}

WEAK AREAS (critical focus needed):
${weakAreas.length > 0 ? weakAreas.map(w => `- ${w.topic}${w.subtopic ? ' (' + w.subtopic + ')' : ''}: ${w.score}% (${w.weakness_type})${w.consecutive_errors >= 3 ? ' ⚠️ CRITICAL - consecutive errors' : ''}`).join('\n') : '- No significant weak areas identified yet'}

RECENT STUDY ACTIVITY:
${recentStudy.length > 0 ? recentStudy.map(s => `- ${s.topic}${s.subtopic ? ' - ' + s.subtopic : ''}: ${s.status}`).join('\n') : '- No recent study activity recorded'}`;

  const systemPrompt = `You are an expert faculty mentor and senior authority on the IBBI Limited Insolvency Examination (India). You have deep knowledge of:
- Insolvency and Bankruptcy Code 2016 and all amendments up to 4 February 2025
- IBC Rules and Regulations (CIRP, Liquidation, Voluntary, Pre-Pack, IP, IPA regulations)
- Business Laws: Companies Act 2013, Contract Act 1872, Transfer of Property Act, Sale of Goods Act, Partnership Act, LLP Act
- General Laws: SARFAESI 2002, RDDBFI 1993, Prevention of Fraud (SFIO), Competition Act, FEMA
- Key case laws: Essar Steel, Swiss Ribbons, Mobilox, Arcelormittal, Innoventive, K. Sashidhar, Gujarat Urja, Phoenix ARC, Jaypee Infratech
- Finance, accounts, valuation basics
- Ethics and professional conduct for Insolvency Professionals

${userContext}

ADAPTIVE TEACHING APPROACH:
1. Focus explanations on user's weak areas (identified above)
2. For topics with low accuracy (<60%), provide more detailed explanations with examples
3. For critical weaknesses (consecutive errors), offer step-by-step breakdowns
4. Reference case laws that are most relevant to user's weak areas
5. Suggest specific study strategies based on error patterns
6. Adjust complexity based on user's overall performance level

WHEN EXPLAINING:
- Always cite specific section numbers and provisions
- Use real-world examples and case law references
- Break down complex concepts into understandable parts
- Connect topics to show interrelationships
- Highlight exam-relevant points and common mistakes

STUDY GUIDANCE:
- Create realistic study plans considering user's weak areas
- Suggest specific topics to focus on based on performance data
- Recommend practice question types for improvement
- Advise on time allocation based on syllabus weightage

PORTAL NAVIGATION GUIDANCE:
You can guide candidates to these syllabus modules: Dashboard, Faculty Desk, Syllabus & Weightage, Mock Examination, Landmark Case Laws, Practical Case Studies (70 Marks), Weak Areas, Study Progress, Attempt History.
Suggest specific actions like "Try a topic test on [weak area]" or "Review case laws for [topic]"

EXAM RELEVANCE:
- Keep responses focused on exam preparation
- Emphasize points that are frequently tested
- Alert to common traps and misconceptions
- Provide memory aids and mnemonics where helpful

IMPORTANT: Laws/regulations as they stood on 4 February 2025. Syllabus effective from 5 May 2025.`;

  try {
    // Build full prompt with history for context
    let fullPrompt = systemPrompt + '\n\n';
    // Add recent history as context
    const pastHistory = history.slice(0, -1).slice(-8); // last 8 messages
    for (const h of pastHistory) {
      fullPrompt += `${h.role === 'user' ? 'User' : 'Assistant'}: ${h.content}\n\n`;
    }
    fullPrompt += `User: ${message}\n\nAssistant:`;

    // Use generateContent directly (simpler, more reliable than startChat)
    const result = await Promise.race([
      geminiModel.generateContent(fullPrompt),
      new Promise((_, reject) => setTimeout(() => reject(new Error('Timeout')), 28000))
    ]);

    const reply = result.response.text();
    db.prepare('INSERT INTO conversations (session_id, role, content) VALUES (?, ?, ?)').run(sessionId, 'assistant', reply);
    res.json({ reply });
  } catch (err) {
    console.error('Gemini error:', err.message);
    console.error('Full error:', err);
    // Return the error message so we can debug
    const fallback = generateFallbackResponse(message, weakAreas, totalAttempts);
    db.prepare('INSERT INTO conversations (session_id, role, content) VALUES (?, ?, ?)').run(sessionId, 'assistant', fallback);
    res.json({ reply: fallback, fallback: true });
  }
});

function generateFallbackResponse(message, weakAreas, attempts) {
  const msg = message.toLowerCase();
  if (msg.includes('section 7') || msg.includes('s7')) {
    return `**Section 7 of IBC — Financial Creditor's Application**\n\nA financial creditor (alone or jointly) can apply to NCLT under Section 7 when:\n- There exists a financial debt\n- The corporate debtor has defaulted (minimum Rs. 1 Crore)\n\nNCLT must admit the application within 14 days if satisfied about default. On admission, moratorium under Section 14 kicks in immediately.\n\n*Key principle: Once default is established, NCLT has no discretion to reject — Innoventive Industries v. ICICI Bank (SC 2018)*`;
  }
  if (msg.includes('moratorium') || msg.includes('section 14')) {
    return `**Moratorium under Section 14 of IBC**\n\nDeclaration: By NCLT on admission of CIRP application.\n\nProhibits:\n1. Institution of suits/proceedings against corporate debtor\n2. Transferring/encumbering assets\n3. Enforcement of any security interest\n4. Recovery of any property\n5. Termination of contracts (ipso facto clauses invalid — Gujarat Urja SC 2021)\n\nDuration: From insolvency commencement date till conclusion of CIRP.`;
  }
  if (msg.includes('weak') || msg.includes('improve')) {
    if (weakAreas.length > 0) {
      return `Based on your performance, focus on: **${weakAreas.map(w => w.topic).join(', ')}**. These areas have accuracy below 60%. Try the Weak Areas tab for targeted practice questions.`;
    }
    return `Complete more questions so I can identify your weak areas. Head to the Mock Test tab and try a topic test or full mock!`;
  }
  if (msg.includes('waterfall') || msg.includes('section 53') || msg.includes('liquidation')) {
    return `**Section 53 — Liquidation Waterfall (Priority Order)**\n\n1. CIRP & Liquidation costs\n2. Secured creditors (up to security value) + Workmen dues (24 months)\n3. Other employee dues (12 months)\n4. Unsecured financial creditors\n5. Government dues (up to 2 years)\n6. Remaining secured creditors (post-security)\n7. Operational creditors and other creditors\n8. Preference shareholders\n9. Equity shareholders\n\n*Exam tip: CIRP costs always rank FIRST — higher than even secured creditors.*`;
  }
  return `**Faculty Study Advisory:**\n\n${attempts < 10 ? '🎯 Start with a **Topic Subject Drill** to master the fundamentals of IBC Sections 1-54.' : `📊 You have completed ${attempts} questions so far. Review your **Dashboard** for topic-wise accuracy.`}\n\n${weakAreas.length > 0 ? `⚠️ Priority Focus Areas: **${weakAreas.map(w => w.topic).join(', ')}**` : '✅ Maintain balanced practice across all 8 syllabus divisions.'}\n\nFeel free to ask for detailed breakdowns of specific provisions (e.g., "Explain Section 7", "What is moratorium under Section 14?", "Explain Section 53 priority waterfall", or "Section 29A disqualifications").`;
}

// GET conversation history
app.get('/api/chat/history', (req, res) => {
  const history = db.prepare('SELECT role, content, created_at FROM conversations WHERE session_id = ? ORDER BY created_at ASC LIMIT 50').all(req.session.userId);
  res.json(history);
});

// Clear chat
app.delete('/api/chat/history', (req, res) => {
  db.prepare('DELETE FROM conversations WHERE session_id = ?').run(req.session.userId);
  res.json({ cleared: true });
});

// ─── STUDY PROGRESS ───────────────────────────────────────────────────────────

app.post('/api/study/progress', (req, res) => {
  const { topic, subtopic, status } = req.body;
  const sid = req.session.userId;
  db.prepare(`INSERT INTO study_progress (session_id, topic, subtopic, status, last_studied) VALUES (?, ?, ?, ?, strftime('%s','now'))
    ON CONFLICT(session_id, topic, subtopic) DO UPDATE SET status = ?, last_studied = strftime('%s','now')`)
    .run(sid, topic, subtopic || '', status || 'studied', status || 'studied');
  res.json({ saved: true });
});

app.get('/api/study/progress', (req, res) => {
  const progress = db.prepare('SELECT * FROM study_progress WHERE session_id = ?').all(req.session.userId);
  res.json(progress);
});

// Fallback route to serve index.html for client-side routing
app.use((req, res, next) => {
  if (req.method === 'GET' && !req.path.startsWith('/api')) {
    return res.sendFile(path.join(__dirname, 'public', 'index.html'));
  }
  next();
});

// ─── START SERVER ─────────────────────────────────────────────────────────────

if (!process.env.VERCEL) {
  app.listen(PORT, () => {
    console.log(`\n🚀 IBBI Adaptive Exam Agent running at http://localhost:${PORT}\n`);
  });
}

module.exports = app;


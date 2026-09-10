const fs = require('fs');
const path = require('path');

class MemoryDB {
  constructor(seedFilePath) {
    this.users = new Map();
    this.sessions = new Map();
    this.attempts = [];
    this.mocks = new Map();
    this.weakAreas = [];
    this.conversations = [];
    this.studyProgress = new Map();
    this.questions = [];
    this.caseLaws = [];
    this.caseStudies = [];
    this.caseStudyQuestions = [];
    this.attemptIdCounter = 0;
    this.weakAreaIdCounter = 0;
    this.convoIdCounter = 0;
    this.seedFilePath = seedFilePath;
    this.loadSeed();
  }

  loadSeed() {
    if (this.seedFilePath && fs.existsSync(this.seedFilePath)) {
      try {
        const data = JSON.parse(fs.readFileSync(this.seedFilePath, 'utf8'));
        this.questions = data.questions || [];
        this.caseLaws = data.case_laws || [];
        this.caseStudies = data.case_studies || [];
        this.caseStudyQuestions = data.case_study_questions || [];
      } catch (e) {
        console.error('Failed to load seed file in MemoryDB:', e.message);
      }
    }
  }

  pragma(str) {
    return [];
  }

  exec(sql) {
    return this;
  }

  prepare(sql) {
    const s = sql.trim().replace(/\s+/g, ' ');
    const db = this;

    return {
      all(...params) {
        return db._executeQuery(s, params, 'all');
      },
      get(...params) {
        return db._executeQuery(s, params, 'get');
      },
      run(...params) {
        return db._executeQuery(s, params, 'run');
      }
    };
  }

  _executeQuery(sql, params, mode) {
    const sLower = sql.toLowerCase();

    // 1. Users / Sessions
    if (sLower.startsWith('insert or ignore into users')) {
      const [id, name] = params;
      if (!this.users.has(id)) {
        this.users.set(id, { id, name, created_at: Math.floor(Date.now() / 1000) });
      }
      return { changes: 1 };
    }

    if (sLower.startsWith('insert or ignore into sessions')) {
      const [id, user_id] = params;
      if (!this.sessions.has(id)) {
        this.sessions.set(id, { id, user_id, created_at: Math.floor(Date.now() / 1000) });
      }
      return { changes: 1 };
    }

    // 2. Questions
    if (sLower.includes('from questions')) {
      // SELECT count(*)
      if (sLower.includes('count(*)')) {
        let qs = this.questions;
        if (sLower.includes("topic = 'case studies'")) {
          qs = qs.filter(q => q.topic === 'Case Studies');
        } else if (sLower.includes('topic = ?')) {
          qs = qs.filter(q => q.topic === params[0]);
        }
        const count = qs.length;
        if (mode === 'get') return { c: count, qCount: count, count };
        return [{ c: count, qCount: count, count }];
      }

      // SELECT by ID
      if (sLower.includes('where id = ?')) {
        const id = Number(params[0]);
        const q = this.questions.find(x => x.id === id);
        return mode === 'get' ? (q ? { ...q } : undefined) : (q ? [{ ...q }] : []);
      }

      // Non-repeating question query 1:
      // SELECT id, marks FROM questions WHERE ... AND id NOT IN (SELECT question_id FROM attempts WHERE session_id = ?) ORDER BY RANDOM() LIMIT ?
      if (sLower.includes('order by random() limit') || sLower.includes('order by') || sLower.includes('where 1=1')) {
        let filtered = [...this.questions];

        // Parse filters from SQL or params
        // Case 1: getNonRepeatingQuestions sql1: conditionSql + AND id NOT IN (SELECT question_id FROM attempts WHERE session_id = ?)
        if (sLower.includes('id not in (select question_id from attempts where session_id = ?)')) {
          const sessionId = params[params.length - 2];
          const limit = Number(params[params.length - 1]);
          const conditionParams = params.slice(0, params.length - 2);

          const attemptedIds = new Set(
            this.attempts.filter(a => a.session_id === sessionId).map(a => a.question_id)
          );

          filtered = filtered.filter(q => !attemptedIds.has(q.id));
          filtered = this._filterQuestionsByCondition(filtered, sql, conditionParams);
          filtered.sort(() => Math.random() - 0.5);
          const sliced = filtered.slice(0, limit);
          return sliced.map(q => ({ id: q.id, marks: q.marks || 1 }));
        }

        // Case 2: getNonRepeatingQuestions sql2 (backfill)
        if (sLower.includes('order by (select coalesce(max(created_at), 0) from attempts')) {
          const limit = Number(params[params.length - 1]);
          const sessionId = params[params.length - 2];
          // Exclude clause
          const excludeMatch = sql.match(/id not in \((.*?)\)/i);
          let excludeCount = 0;
          if (excludeMatch) {
            const placeholders = excludeMatch[1].split(',');
            excludeCount = placeholders.length;
          }
          const excludeIds = new Set(params.slice(params.length - 2 - excludeCount, params.length - 2));
          const conditionParams = params.slice(0, params.length - 2 - excludeCount);

          filtered = filtered.filter(q => !excludeIds.has(q.id));
          filtered = this._filterQuestionsByCondition(filtered, sql, conditionParams);

          // Sort by least recently attempted
          const lastAttemptMap = new Map();
          for (const a of this.attempts) {
            if (a.session_id === sessionId) {
              const cur = lastAttemptMap.get(a.question_id) || 0;
              if (a.created_at > cur) lastAttemptMap.set(a.question_id, a.created_at);
            }
          }

          filtered.sort((a, b) => {
            const timeA = lastAttemptMap.get(a.id) || 0;
            const timeB = lastAttemptMap.get(b.id) || 0;
            if (timeA !== timeB) return timeA - timeB;
            return Math.random() - 0.5;
          });

          const sliced = filtered.slice(0, limit);
          return sliced.map(q => ({ id: q.id, marks: q.marks || 1 }));
        }

        // Case 3: Standard GET /api/questions query
        // SELECT * FROM questions WHERE 1=1 AND topic = ? ... ORDER BY RANDOM() LIMIT ?
        let pIdx = 0;
        if (sLower.includes('and topic = ?')) {
          const t = params[pIdx++];
          filtered = filtered.filter(q => q.topic === t);
        }
        if (sLower.includes('and subtopic = ?')) {
          const st = params[pIdx++];
          filtered = filtered.filter(q => q.subtopic === st);
        }
        if (sLower.includes('and difficulty = ?')) {
          const d = Number(params[pIdx++]);
          filtered = filtered.filter(q => q.difficulty === d);
        }
        if (sLower.includes('and difficulty <=')) {
          if (sLower.includes('difficulty <= 2')) filtered = filtered.filter(q => q.difficulty <= 2);
          else if (sLower.includes('difficulty <= 3')) filtered = filtered.filter(q => q.difficulty <= 3);
        }
        if (sLower.includes('and id not in (')) {
          const notInMatch = sql.match(/id not in \((.*?)\)/i);
          if (notInMatch) {
            const count = notInMatch[1].split(',').length;
            const notInIds = new Set(params.slice(pIdx, pIdx + count).map(Number));
            pIdx += count;
            filtered = filtered.filter(q => !notInIds.has(q.id));
          }
        }

        const limit = Number(params[params.length - 1]) || 10;
        filtered.sort(() => Math.random() - 0.5);
        return filtered.slice(0, limit).map(q => ({ ...q }));
      }
    }

    // 3. Attempts
    if (sLower.startsWith('insert into attempts')) {
      const now = Math.floor(Date.now() / 1000);
      let session_id, question_id, mock_id, selected_answer, is_correct, marks_earned, time_taken, topic, subtopic, difficulty, error_type;

      if (params.length === 11) {
        [session_id, question_id, mock_id, selected_answer, is_correct, marks_earned, time_taken, topic, subtopic, difficulty, error_type] = params;
      } else if (params.length === 10) {
        [session_id, question_id, mock_id, selected_answer, is_correct, marks_earned, time_taken, topic, subtopic, difficulty] = params;
        error_type = 'unattempted';
      } else if (params.length === 8) {
        // Case studies answer insert
        [session_id, question_id, selected_answer, is_correct, marks_earned, topic, subtopic, error_type] = params;
        difficulty = 3;
        mock_id = null;
        time_taken = 0;
      }

      this.attempts.push({
        id: ++this.attemptIdCounter,
        session_id,
        question_id,
        mock_id: mock_id || null,
        selected_answer,
        is_correct: is_correct === 1 || is_correct === true ? 1 : 0,
        marks_earned: parseFloat(Number(marks_earned || 0).toFixed(2)),
        time_taken: Number(time_taken || 0),
        topic,
        subtopic,
        difficulty: Number(difficulty || 1),
        error_type: error_type || null,
        created_at: now
      });
      return { changes: 1, lastInsertRowid: this.attemptIdCounter };
    }

    if (sLower.includes('from attempts')) {
      // SELECT topic, COUNT(*) as attempts, SUM(is_correct) as correct, ROUND(100.0 * SUM(is_correct) / COUNT(*), 1) as accuracy FROM attempts WHERE session_id = ? GROUP BY topic
      if (sLower.includes('group by topic')) {
        const sessionId = params[0];
        const userAttempts = this.attempts.filter(a => a.session_id === sessionId);
        const map = {};
        for (const a of userAttempts) {
          if (!a.topic) continue;
          if (!map[a.topic]) map[a.topic] = { topic: a.topic, attempts: 0, correct: 0 };
          map[a.topic].attempts++;
          if (a.is_correct === 1) map[a.topic].correct++;
        }
        let list = Object.values(map).map(m => ({
          topic: m.topic,
          attempts: m.attempts,
          correct: m.correct,
          accuracy: m.attempts > 0 ? parseFloat(((m.correct / m.attempts) * 100).toFixed(1)) : 0
        }));
        if (sLower.includes('order by accuracy asc')) {
          list.sort((a, b) => a.accuracy - b.accuracy);
        }
        return list;
      }

      // SELECT count(*)
      if (sLower.includes('count(*) as c')) {
        const sessionId = params[0];
        let userAttempts = this.attempts.filter(a => a.session_id === sessionId);
        if (sLower.includes('is_correct = 1')) {
          userAttempts = userAttempts.filter(a => a.is_correct === 1);
        }
        return mode === 'get' ? { c: userAttempts.length } : [{ c: userAttempts.length }];
      }

      // SELECT COALESCE(SUM(marks_earned),0) as s
      if (sLower.includes('sum(marks_earned)')) {
        const sessionId = params[0];
        const sum = this.attempts
          .filter(a => a.session_id === sessionId)
          .reduce((tot, a) => tot + (a.marks_earned || 0), 0);
        return mode === 'get' ? { s: parseFloat(sum.toFixed(2)) } : [{ s: parseFloat(sum.toFixed(2)) }];
      }

      // SELECT is_correct, marks_earned FROM attempts WHERE session_id = ? AND question_id IN (...)
      if (sLower.includes('question_id in')) {
        const sessionId = params[0];
        const qIds = new Set(params.slice(1).map(Number));
        const matches = this.attempts.filter(a => a.session_id === sessionId && qIds.has(a.question_id));
        return matches.map(m => ({ is_correct: m.is_correct, marks_earned: m.marks_earned }));
      }

      // SELECT selected_answer, is_correct, marks_earned FROM attempts WHERE session_id = ? AND question_id = ? ORDER BY created_at DESC LIMIT 1
      if (sLower.includes('order by created_at desc limit 1')) {
        const [sessionId, qId] = params;
        const matches = this.attempts
          .filter(a => a.session_id === sessionId && a.question_id === Number(qId))
          .sort((a, b) => b.created_at - a.created_at);
        const item = matches[0];
        return mode === 'get' ? (item ? { selected_answer: item.selected_answer, is_correct: item.is_correct, marks_earned: item.marks_earned } : undefined) : (item ? [item] : []);
      }

      // History query:
      // SELECT a.*, q.question, q.topic, q.subtopic FROM attempts a LEFT JOIN questions q ON a.question_id = q.id WHERE a.session_id = ? ORDER BY a.created_at DESC LIMIT 50
      if (sLower.includes('order by a.created_at desc limit 50')) {
        const sessionId = params[0];
        const userAttempts = this.attempts
          .filter(a => a.session_id === sessionId)
          .sort((a, b) => b.created_at - a.created_at)
          .slice(0, 50);

        const qMap = new Map(this.questions.map(q => [q.id, q]));
        return userAttempts.map(a => {
          const q = qMap.get(a.question_id) || {};
          return {
            ...a,
            question: q.question || '',
            topic: q.topic || a.topic,
            subtopic: q.subtopic || a.subtopic
          };
        });
      }
    }

    // 4. Mocks
    if (sLower.startsWith('insert into mocks')) {
      const [id, session_id, type, questions, duration, max_marks] = params;
      const now = Math.floor(Date.now() / 1000);
      this.mocks.set(id, {
        id,
        session_id,
        type,
        status: 'active',
        questions,
        answers: '{}',
        start_time: now,
        duration: Number(duration || 7200),
        max_marks: Number(max_marks || 100),
        total_marks: 0,
        created_at: now
      });
      return { changes: 1 };
    }

    if (sLower.includes('from mocks')) {
      if (sLower.includes('count(*) as c')) {
        const sessionId = params[0];
        const userMocks = Array.from(this.mocks.values()).filter(m => m.session_id === sessionId && m.status === 'completed');
        return mode === 'get' ? { c: userMocks.length } : [{ c: userMocks.length }];
      }

      if (sLower.includes('where id = ? and session_id = ?')) {
        const [id, sessionId] = params;
        const mock = this.mocks.get(id);
        const valid = mock && mock.session_id === sessionId ? { ...mock } : undefined;
        return mode === 'get' ? valid : (valid ? [valid] : []);
      }

      // Recent completed mock for AI context
      if (sLower.includes("order by created_at desc limit 1")) {
        const sessionId = params[0];
        const userMocks = Array.from(this.mocks.values())
          .filter(m => m.session_id === sessionId && m.status === 'completed')
          .sort((a, b) => b.created_at - a.created_at);
        const top = userMocks[0];
        return mode === 'get' ? (top ? { total_marks: top.total_marks, max_marks: top.max_marks, type: top.type } : undefined) : (top ? [top] : []);
      }

      // Recent mocks list
      if (sLower.includes('order by created_at desc limit 5')) {
        const sessionId = params[0];
        const userMocks = Array.from(this.mocks.values())
          .filter(m => m.session_id === sessionId)
          .sort((a, b) => b.created_at - a.created_at)
          .slice(0, 5)
          .map(m => ({
            id: m.id,
            type: m.type,
            total_marks: m.total_marks,
            max_marks: m.max_marks,
            status: m.status,
            created_at: m.created_at,
            percentage: m.max_marks ? parseFloat(((m.total_marks / m.max_marks) * 100).toFixed(1)) : 0
          }));
        return userMocks;
      }
    }

    if (sLower.startsWith('update mocks set answers = ? where id = ?')) {
      const [answers, id] = params;
      const mock = this.mocks.get(id);
      if (mock) mock.answers = answers;
      return { changes: 1 };
    }

    if (sLower.startsWith("update mocks set status = 'completed'")) {
      const [total_marks, id] = params;
      const mock = this.mocks.get(id);
      if (mock) {
        mock.status = 'completed';
        mock.end_time = Math.floor(Date.now() / 1000);
        mock.total_marks = Number(total_marks || 0);
      }
      return { changes: 1 };
    }

    // 5. Weak Areas
    if (sLower.startsWith('select * from weak_areas where session_id = ? and topic = ? and subtopic = ?')) {
      const [sessionId, topic, subtopic] = params;
      const item = this.weakAreas.find(w => w.session_id === sessionId && w.topic === topic && (w.subtopic || '') === (subtopic || ''));
      return mode === 'get' ? (item ? { ...item } : undefined) : (item ? [{ ...item }] : []);
    }

    if (sLower.startsWith('update weak_areas set attempts = ?')) {
      const [newAttempts, newCorrect, score, weaknessType, consecutiveErrors, id] = params;
      const item = this.weakAreas.find(w => w.id === id);
      if (item) {
        item.attempts = newAttempts;
        item.correct = newCorrect;
        item.score = score;
        item.weakness_type = weaknessType;
        item.consecutive_errors = consecutiveErrors;
        item.last_updated = Math.floor(Date.now() / 1000);
      }
      return { changes: 1 };
    }

    if (sLower.startsWith('insert into weak_areas')) {
      const [session_id, topic, subtopic, weakness_type, score, correct, consecutive_errors] = params;
      this.weakAreas.push({
        id: ++this.weakAreaIdCounter,
        session_id,
        topic,
        subtopic: subtopic || '',
        weakness_type: weakness_type || 'unknown',
        score: Number(score || 0),
        attempts: 1,
        correct: Number(correct || 0),
        consecutive_errors: Number(consecutive_errors || 0),
        last_updated: Math.floor(Date.now() / 1000)
      });
      return { changes: 1 };
    }

    if (sLower.includes('from weak_areas')) {
      const sessionId = params[0];
      let userAreas = this.weakAreas.filter(w => w.session_id === sessionId);

      if (sLower.includes('score < 60')) {
        userAreas = userAreas.filter(w => w.score < 60);
      }
      if (sLower.includes('attempts >= 1')) {
        userAreas = userAreas.filter(w => w.attempts >= 1);
      }

      userAreas.sort((a, b) => {
        if (a.score !== b.score) return a.score - b.score;
        return (b.consecutive_errors || 0) - (a.consecutive_errors || 0);
      });

      const limitMatch = sLower.match(/limit (\d+)/);
      if (limitMatch) {
        userAreas = userAreas.slice(0, Number(limitMatch[1]));
      }

      return userAreas.map(w => ({ ...w }));
    }

    // 6. Case Laws
    if (sLower.includes('from case_laws')) {
      if (sLower.includes('where id = ?')) {
        const id = Number(params[0]);
        const cl = this.caseLaws.find(x => x.id === id);
        return mode === 'get' ? (cl ? { ...cl } : undefined) : (cl ? [{ ...cl }] : []);
      }

      let filtered = [...this.caseLaws];
      let pIdx = 0;
      if (sLower.includes('(case_name like ? or facts like ? or exam_principle like ?)')) {
        const term = (params[pIdx++] || '').replace(/%/g, '').toLowerCase();
        pIdx += 2; // skip the next two matching params
        filtered = filtered.filter(cl =>
          (cl.case_name || '').toLowerCase().includes(term) ||
          (cl.facts || '').toLowerCase().includes(term) ||
          (cl.exam_principle || '').toLowerCase().includes(term)
        );
      }
      if (sLower.includes('and topic = ?')) {
        const t = params[pIdx++];
        filtered = filtered.filter(cl => cl.topic === t);
      }
      filtered.sort((a, b) => (b.year || 0) - (a.year || 0));
      return filtered.map(cl => ({ ...cl }));
    }

    // 7. Case Studies & Questions
    if (sLower.includes('from case_studies')) {
      if (sLower.includes('where id = ?')) {
        const id = Number(params[0]);
        const cs = this.caseStudies.find(x => x.id === id);
        return mode === 'get' ? (cs ? { ...cs } : undefined) : (cs ? [{ ...cs }] : []);
      }
      return this.caseStudies.sort((a, b) => a.id - b.id).map(cs => ({ ...cs }));
    }

    if (sLower.includes('from case_study_questions')) {
      if (sLower.includes('where id = ?')) {
        const id = Number(params[0]);
        const q = this.caseStudyQuestions.find(x => x.id === id);
        return mode === 'get' ? (q ? { ...q } : undefined) : (q ? [{ ...q }] : []);
      }

      if (sLower.includes('where case_study_id = ?')) {
        const csId = Number(params[0]);
        const qs = this.caseStudyQuestions.filter(x => x.case_study_id === csId);
        if (sLower.includes('count(*) as c')) {
          return mode === 'get' ? { c: qs.length } : [{ c: qs.length }];
        }
        if (sLower.includes('select id from')) {
          return qs.map(q => ({ id: q.id }));
        }
        return qs.map(q => ({ ...q }));
      }
    }

    // 8. Conversations
    if (sLower.startsWith('insert into conversations')) {
      const [session_id, role, content] = params;
      this.conversations.push({
        id: ++this.convoIdCounter,
        session_id,
        role,
        content,
        created_at: Math.floor(Date.now() / 1000)
      });
      return { changes: 1 };
    }

    if (sLower.includes('from conversations')) {
      const sessionId = params[0];
      const convos = this.conversations.filter(c => c.session_id === sessionId);
      if (sLower.includes('order by created_at desc limit 12')) {
        convos.sort((a, b) => b.created_at - a.created_at);
        return convos.slice(0, 12).map(c => ({ role: c.role, content: c.content }));
      }
      convos.sort((a, b) => a.created_at - b.created_at);
      return convos.slice(0, 50).map(c => ({ role: c.role, content: c.content, created_at: c.created_at }));
    }

    if (sLower.startsWith('delete from conversations')) {
      const sessionId = params[0];
      this.conversations = this.conversations.filter(c => c.session_id !== sessionId);
      return { changes: 1 };
    }

    // 9. Study Progress
    if (sLower.startsWith('insert into study_progress')) {
      const [session_id, topic, subtopic, status] = params;
      const key = `${session_id}::${topic}::${subtopic || ''}`;
      this.studyProgress.set(key, {
        session_id,
        topic,
        subtopic: subtopic || '',
        status: status || 'studied',
        last_studied: Math.floor(Date.now() / 1000)
      });
      return { changes: 1 };
    }

    if (sLower.includes('from study_progress')) {
      const sessionId = params[0];
      const list = Array.from(this.studyProgress.values()).filter(p => p.session_id === sessionId);
      if (sLower.includes('order by last_studied desc limit 3')) {
        list.sort((a, b) => b.last_studied - a.last_studied);
        return list.slice(0, 3).map(p => ({ ...p }));
      }
      return list.map(p => ({ ...p }));
    }

    console.warn('MemoryDB Unhandled SQL:', sql, params);
    return mode === 'get' ? undefined : (mode === 'run' ? { changes: 0 } : []);
  }

  _filterQuestionsByCondition(questions, sql, params) {
    const sLower = sql.toLowerCase();
    let res = questions;

    if (sLower.includes("topic = 'case studies'")) {
      res = res.filter(q => q.topic === 'Case Studies');
    } else if (sLower.includes("topic = 'ibc'")) {
      res = res.filter(q => q.topic === 'IBC');
    } else if (sLower.includes("topic = 'rules & regulations'")) {
      res = res.filter(q => q.topic === 'Rules & Regulations');
    } else if (sLower.includes("topic = 'business laws'")) {
      res = res.filter(q => q.topic === 'Business Laws');
    } else if (sLower.includes("topic = 'general laws'")) {
      res = res.filter(q => q.topic === 'General Laws');
    } else if (sLower.includes("topic in ('finance & accounts','general awareness')")) {
      res = res.filter(q => q.topic === 'Finance & Accounts' || q.topic === 'General Awareness');
    } else if (sLower.includes('topic = ?') && params.length > 0) {
      res = res.filter(q => q.topic === params[0]);
    }

    if (sLower.includes("tags like '%caselaw%'")) {
      res = res.filter(q => (q.tags || '').toLowerCase().includes('caselaw'));
    }

    return res;
  }
}

module.exports = MemoryDB;

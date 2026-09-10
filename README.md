# IBBI Adaptive Exam Agent — Limited Insolvency Examination

An adaptive examination preparation and simulation portal for aspirants taking the **Insolvency and Bankruptcy Board of India (IBBI) Limited Insolvency Examination**, aligned with the latest legal curriculum effective 2025.

---

## 🎯 Key Features

- **Interactive Examination Modes**:
  - **Full-Length Mock (100 Marks)**: 120-minute simulation with official marking blueprint (+marks and -0.25 negative penalty).
  - **15-Question Speed Drill**: Quick daily pacing and recall drills.
  - **Topic-Specific Drill**: Focus on specific syllabus areas to build mastery.
- **Non-Repeating Question Engine**:
  - Automatically avoids repeating recently attempted questions across consecutive tests.
  - Comprehensive question bank of 160+ high-yield statutory questions across all 8 syllabus divisions.
- **Interactive Practical Case Studies (70 Marks)**:
  - Full-length factual scenarios with multi-part 4-mark sub-questions.
  - Instant scoring, progress tracking, and detailed statutory rationales.
- **Question-by-Question Statutory Review**:
  - Displays all 4 options (A, B, C, D) for each question.
  - Visual indicators for candidate selection (correct/incorrect) and official answer keys.
  - Section-wise statutory rationales and landmark Supreme Court / NCLAT precedents.
  - Review filters (All, Incorrect Only, Correct Only, Unattempted Only).
- **Interactive Syllabus & Milestone Tracking**:
  - Expandable topic modules with subtopic study notes and key takeaways.
  - Real-time mock test performance tracking per syllabus division.
  - Direct actions to launch practice drills or consult the AI Tutor.
- **AI Tutor (Faculty Desk)**:
  - Context-aware tutor referencing the Insolvency and Bankruptcy Code 2016, rules, regulations, and landmark case laws.
- **Candidate Dashboard & Analytics**:
  - Overall accuracy, questions attempted, mocks completed, and exam countdown.
  - Performance diagnostics matrix identifying weak topics (<60% accuracy).
- **Modern User Experience**:
  - High-performance UI with Light and Dark mode toggle.
  - Full examination keyboard shortcuts (1-4 / A-D, Arrow keys, M to mark for review, C to clear).

---

## 🚀 Quick Start

### 1. Clone the Repository
```bash
git clone https://github.com/latheefAlmir05/IBBI-ADAPTIVE-EXAM-AGENT_V3.git
cd IBBI-ADAPTIVE-EXAM-AGENT_V3
```

### 2. Install Dependencies
```bash
npm install
```

### 3. Configure Environment Variables
Copy `.env.example` to `.env` and provide your configuration:
```bash
cp .env.example .env
```

Edit `.env`:
```env
PORT=3000
SESSION_SECRET=your_session_secret
GEMINI_API_KEY=your_gemini_api_key_here
GEMINI_MODEL=gemini-3.6-flash
```

### 4. Start the Application
```bash
npm start
```

Open your browser and navigate to:
```
http://localhost:3000
```

---

## 📚 Syllabus Structure & Weightage

| Syllabus Division | Weightage | Description |
| :--- | :--- | :--- |
| **Case Studies** | **70 Marks** | Practical multi-question scenarios on CIRP, Liquidation, Pre-Pack & Avoidance |
| **General Laws** | **7 Marks** | SARFAESI Act, RDDBFI / RDB Act, SFIO, Competition Act, FEMA |
| **Rules & Regulations** | **6 Marks** | IBBI CIRP, Liquidation, IP, IPA, and Pre-Pack Regulations |
| **Case Laws** | **5 Marks** | Landmark Supreme Court (*Swiss Ribbons*, *Essar Steel*, *Mobilox*) and NCLAT rulings |
| **Insolvency & Bankruptcy Code** | **4 Marks** | Core IBC Provisions (Sections 1–54, Part III Individual Insolvency) |
| **Business Laws** | **4 Marks** | Companies Act 2013, Contract Act 1872, Transfer of Property Act, LLP Act |
| **Finance & Accounts** | **2 Marks** | Financial statements analysis, valuation (Fair vs Liquidation Value) |
| **General Awareness** | **2 Marks** | IBBI constitution, Information Utilities, recent legislative amendments |

---

## 🛠️ Technology Stack

- **Backend**: Node.js, Express.js, Express Session
- **Database**: SQLite (via `better-sqlite3` with WAL mode)
- **AI Integration**: Google Generative AI (`@google/generative-ai`)
- **Frontend**: HTML5, Tailwind CSS, FontAwesome 6, Chart.js, Marked.js, Canvas Confetti
const { db } = require('./db');

const additionalQuestions = [
  // ─── Case Studies Questions (4 Marks each) ─────────────────────────
  ['Case Studies', 'CIRP', 3, 'mcq',
   'In a CIRP with total admitted financial debt of Rs. 400 Crore, Bank A holds Rs. 260 Crore, Bank B holds Rs. 80 Crore, and Bank C holds Rs. 60 Crore. A resolution plan proposing a 40% recovery is voted on. Bank A and Bank C vote in favour, while Bank B dissents. Is the resolution plan approved by the CoC?',
   'No, unanimous approval of all secured financial creditors is mandatory under IBC',
   'Yes, because Bank A and Bank C together represent 80% of the voting share, which satisfies the 66% requirement under Section 30(4)',
   'No, because dissenting creditors hold more than 15% of the voting share',
   'Yes, provided the NCLT grants special dispensation for dissenting financial institutions',
   'B', 'Under Section 30(4) of IBC, approval of a resolution plan requires a minimum 66% voting share of the Committee of Creditors. Bank A (65%) + Bank C (15%) = 80%, which exceeds the 66% threshold.', 4, 'CaseStudies,CoC,Voting,Section30'],

  ['Case Studies', 'Liquidation', 3, 'mcq',
   'In the liquidation of Delta Steel Ltd., liquidation proceeds realize Rs. 100 Crore. CIRP and liquidation costs are Rs. 10 Crore. Workmen dues for the preceding 24 months are Rs. 20 Crore. A secured creditor with a relinquished security interest has an admitted claim of Rs. 60 Crore. How much will workmen and the secured creditor receive respectively under Section 53(1)(b)?',
   'Workmen receive Rs. 20 Crore in full; Secured Creditor receives Rs. 60 Crore in full',
   'Workmen receive Rs. 22.5 Crore; Secured Creditor receives Rs. 67.5 Crore',
   'Workmen receive Rs. 22.5 Crore; Secured Creditor receives Rs. 67.5 Crore proportionally out of remaining Rs. 90 Crore (1:3 ratio)',
   'Workmen receive Rs. 20 Crore; Secured Creditor receives Rs. 60 Crore out of the remaining Rs. 90 Crore without deduction',
   'D', 'After paying Rs. 10 Crore CIRP costs, Rs. 90 Crore remains. Under Section 53(1)(b), workmen dues (24 months) of Rs. 20 Crore and relinquished secured debts of Rs. 60 Crore rank pari passu (total Rs. 80 Crore). Since Rs. 90 Crore is available, both claims are satisfied in full.', 4, 'CaseStudies,Liquidation,Section53,Waterfall'],

  ['Case Studies', 'Pre-Pack', 3, 'mcq',
   'An MSME corporate debtor initiates a Pre-Packaged Insolvency Resolution Process (PPIRP) under Chapter III-A. The base resolution plan submitted by the promoters proposes a haircut of 35% on operational creditors and 20% on financial creditors. What action must the CoC take before approving this plan or opening competitive bidding?',
   'The CoC must approve it immediately since promoters of MSMEs have absolute exemption',
   'Under Section 54K, if the base resolution plan impairs operational creditor claims, CoC must require promoters to submit a revised plan or invite competing plans from third parties',
   'The base resolution plan is void ab initio and CIRP must immediately be ordered',
   'Operational creditors must vote with equal voting share alongside financial creditors',
   'B', 'Under Section 54K of IBC, if the base resolution plan impairs any operational creditor claims, the Committee of Creditors must require the promoters to improve the plan or invite Swiss-challenge competitive bids.', 4, 'CaseStudies,PPIRP,Section54K,MSME'],

  ['Case Studies', 'Avoidance Transactions', 3, 'mcq',
   'During CIRP, the RP discovers that 8 months prior to the insolvency commencement date, the corporate debtor transferred commercial real estate worth Rs. 50 Crore to a director’s brother for Rs. 15 Crore. Under which section should the RP file an application before NCLT, and what is the relevant look-back period?',
   'Section 43 (Preferential Transaction), look-back period 1 year',
   'Section 45 (Undervalued Transaction), look-back period 2 years for related parties',
   'Section 50 (Extortionate Credit), look-back period 3 years',
   'Section 66 (Fraudulent Trading), look-back period strictly 6 months',
   'B', 'Section 45 read with Section 46 of IBC covers Undervalued Transactions. For transactions with related parties (e.g. director\'s brother), the statutory look-back period is 2 years preceding the insolvency commencement date.', 4, 'CaseStudies,Undervalued,Section45,Avoidance'],

  ['Case Studies', 'CIRP', 3, 'mcq',
   'During CIRP, a resolution applicant submits a plan. The applicant is an entity where the promoter was convicted of an offence punishable with imprisonment for 3 years under the Companies Act 2013, and 5 years have not elapsed from the date of release. Is this resolution applicant eligible to submit a resolution plan?',
   'Yes, criminal convictions do not disqualify applicants under corporate restructuring',
   'No, under Section 29A(d), a person convicted for any offence punishable with imprisonment for 2 or more years is disqualified if 5 years have not elapsed from release',
   'Yes, provided a penalty fine of Rs. 1 Crore is deposited in the escrow account',
   'Only if the Committee of Creditors approves by an 80% supermajority',
   'B', 'Section 29A(d) of IBC specifically disqualifies any person who has been convicted for any offence punishable with imprisonment for two years or more, unless a period of five years has elapsed from the date of release.', 4, 'CaseStudies,Section29A,Eligibility'],

  // ─── IBC Core Provisions ───────────────────────────────────────────
  ['IBC', 'CIRP Timelines', 2, 'mcq',
   'What is the maximum mandatory period within which Corporate Insolvency Resolution Process (CIRP) must be completed, including all extensions and litigation time?',
   '180 days', '270 days', '330 days', '365 days',
   'C', 'The second proviso to Section 12(3) of IBC mandates that the resolution process shall be completed within a period of 330 days from the insolvency commencement date, including any extension of the period of CIRP and time taken in legal proceedings.', 1, 'IBC,Section12,Timeline'],

  ['IBC', 'Withdrawal', 2, 'mcq',
   'Under Section 12A of IBC, an application admitted under Section 7, 9, or 10 may be withdrawn with the approval of what voting threshold of the Committee of Creditors?',
   '66%', '75%', '90%', '100%',
   'C', 'Section 12A requires approval of ninety per cent (90%) voting share of the Committee of Creditors for withdrawal of an admitted CIRP application.', 1, 'IBC,Section12A,Withdrawal'],

  ['IBC', 'Fraudulent Trading', 2, 'mcq',
   'Under Section 66 of IBC (Fraudulent Trading or Wrongful Trading), which authority has the power to direct that directors/partners shall be personally liable without limitation of liability?',
   'Insolvency and Bankruptcy Board of India (IBBI)',
   'National Company Law Tribunal (NCLT / Adjudicating Authority)',
   'Special Fraud Investigation Office (SFIO)',
   'Committee of Creditors (CoC)',
   'B', 'Under Section 66(1) and (2) of IBC, on an application by the RP, the Adjudicating Authority (NCLT) may order that any persons who were knowingly parties to carrying on business with intent to defraud creditors shall be personally liable.', 1, 'IBC,Section66,FraudulentTrading'],

  ['IBC', 'Moratorium', 2, 'mcq',
   'Does the moratorium declared under Section 14 of the IBC apply to a personal guarantor or corporate guarantor of the corporate debtor?',
   'Yes, moratorium halts all proceedings against both the principal debtor and guarantors',
   'No, Section 14(3)(b) explicitly states that the moratorium shall not apply to a surety in a contract of guarantee to a corporate debtor',
   'Yes, but only if the guarantor is an individual and not a corporate entity',
   'Moratorium applies to personal guarantors for a maximum period of 90 days only',
   'B', 'Under Section 14(3)(b) (inserted by 2018 amendment and confirmed by Supreme Court in State Bank of India v. V. Ramakrishnan), moratorium does not apply to a guarantor to a corporate debtor.', 1, 'IBC,Section14,Guarantor'],

  ['IBC', 'Committee of Creditors', 2, 'mcq',
   'If a corporate debtor has only operational creditors and no financial creditors, how is the Committee of Creditors constituted under Regulation 16 of CIRP Regulations?',
   'No CoC is formed; the IRP manages the process independently',
   'The CoC comprises the eighteen largest operational creditors by value, or all operational creditors if less than 18, plus one representative each of workmen and employees',
   'The NCLT appoints an official liquidator to represent creditors',
   'The CoC comprises only the top 5 operational creditors and shareholders',
   'B', 'Regulation 16 of the IBBI (CIRP) Regulations provides that where the corporate debtor has no financial debts, the CoC is constituted of 18 largest operational creditors by value, plus representatives of workmen and employees.', 1, 'IBC,CoC,Regulation16'],

  // ─── Rules and Regulations ─────────────────────────────────────────
  ['Rules & Regulations', 'CIRP Regulations', 2, 'mcq',
   'Under Regulation 35 of the IBBI (CIRP) Regulations, 2016, how many registered valuers must the Resolution Professional appoint to determine the fair value and liquidation value of the corporate debtor?',
   'One registered valuer for each asset class',
   'Two registered valuers for each asset class',
   'Three registered valuers in total',
   'One valuer appointed jointly by CoC and IRP',
   'B', 'Regulation 35(1) mandates that the Resolution Professional shall appoint two registered valuers to determine the fair value and liquidation value of the corporate debtor in accordance with internationally accepted valuation standards.', 1, 'Regulations,Valuation,Regulation35'],

  ['Rules & Regulations', 'Liquidation Regulations', 2, 'mcq',
   'Under Regulation 31A of IBBI (Liquidation Process) Regulations, what is the timeline for the liquidator to constitute the Stakeholders’ Consultation Committee (SCC)?',
   'Within 15 days from the liquidation commencement date',
   'Within 30 days from the liquidation commencement date',
   'Within 60 days from the liquidation commencement date',
   'Within 90 days from the appointment of liquidator',
   'C', 'Regulation 31A(1) of IBBI (Liquidation Process) Regulations, 2016 requires the liquidator to constitute the Stakeholders\' Consultation Committee within sixty days from the liquidation commencement date.', 1, 'Regulations,SCC,Liquidation'],

  ['Rules & Regulations', 'IP Regulations', 1, 'mcq',
   'An Insolvency Professional must obtain an Authorisation for Assignment (AFA) from which entity before accepting any assignment as IRP, RP, Liquidator, or Bankruptcy Trustee?',
   'Insolvency and Bankruptcy Board of India (IBBI)',
   'National Company Law Tribunal (NCLT)',
   'Insolvency Professional Agency (IPA) where he is enrolled',
   'Ministry of Corporate Affairs (MCA)',
   'C', 'Under Regulation 7A of the IBBI (Insolvency Professionals) Regulations, 2016, an IP shall not accept any assignment unless he holds a valid Authorisation for Assignment issued by the Insolvency Professional Agency of which he is a professional member.', 1, 'Regulations,AFA,IP'],

  // ─── Business Laws ─────────────────────────────────────────────────
  ['Business Laws', 'Companies Act 2013', 2, 'mcq',
   'Under Section 135 of the Companies Act, 2013, what percentage of the average net profits made by the company during the three immediately preceding financial years must be spent on Corporate Social Responsibility (CSR)?',
   '1%', '2%', '3%', '5%',
   'B', 'Section 135(5) of the Companies Act, 2013 requires eligible companies to spend at least 2% of the average net profits made during the three immediately preceding financial years in pursuance of its Corporate Social Responsibility Policy.', 1, 'BusinessLaws,CompaniesAct,CSR'],

  ['Business Laws', 'Contract Act 1872', 2, 'mcq',
   'Under Section 126 of the Indian Contract Act, 1872, what is the contract of guarantee defined as?',
   'A contract to indemnify against loss caused by the promisor',
   'A contract to perform the promise, or discharge the liability, of a third person in case of his default',
   'An agreement enforceable by law between a creditor and debtor only',
   'A bailment of goods as security for payment of debt',
   'B', 'Section 126 of the Indian Contract Act, 1872 defines a "contract of guarantee" as a contract to perform the promise, or discharge the liability, of a third person in case of his default.', 1, 'BusinessLaws,ContractAct,Guarantee'],

  ['Business Laws', 'Transfer of Property Act', 2, 'mcq',
   'Under Section 58 of the Transfer of Property Act, 1882, in which type of mortgage does the mortgagor bind himself personally to pay the mortgage-money and agree that in default, the property may be sold?',
   'Usufructuary Mortgage',
   'Simple Mortgage',
   'Mortgage by Conditional Sale',
   'English Mortgage',
   'B', 'Under Section 58(b) of Transfer of Property Act 1882, in a Simple Mortgage, the mortgagor binds himself personally to pay and agrees that if he fails, the mortgagee shall have a right to cause the mortgaged property to be sold.', 1, 'BusinessLaws,TPA,Mortgage'],

  // ─── General Laws ──────────────────────────────────────────────────
  ['General Laws', 'SARFAESI Act 2002', 2, 'mcq',
   'Under Section 13(2) of the SARFAESI Act, 2002, how many days notice must a secured creditor give to the borrower requiring him to discharge in full his liabilities before taking enforcement action?',
   '30 days', '45 days', '60 days', '90 days',
   'C', 'Section 13(2) of the SARFAESI Act mandates a 60-day notice period in writing requiring the borrower to discharge in full his liabilities, failing which the secured creditor may exercise rights under Section 13(4).', 1, 'GeneralLaws,SARFAESI,Notice'],

  ['General Laws', 'RDDBFI Act 1993', 2, 'mcq',
   'Under the Recovery of Debts and Bankruptcy Act, 1993 (formerly RDDBFI Act), what is the minimum debt threshold for a bank or financial institution to file an application before the Debt Recovery Tribunal (DRT)?',
   'Rs. 5 Lakhs', 'Rs. 10 Lakhs', 'Rs. 20 Lakhs', 'Rs. 50 Lakhs',
   'C', 'By notification dated 6 September 2018, the Central Government raised the minimum pecuniary threshold for filing an application before the DRT under Section 1(4) of the Act from Rs. 10 Lakhs to Rs. 20 Lakhs.', 1, 'GeneralLaws,DRT,Threshold'],

  // ─── Finance, Accounts & Valuation ─────────────────────────────────
  ['Finance & Accounts', 'Valuation Principles', 2, 'mcq',
   'Under the IBBI valuation guidelines, what is "Liquidation Value" defined as in the context of CIRP?',
   'The value of assets as recorded in the audited financial statements of the company',
   'The estimated realizable value of the assets of the corporate debtor if the corporate debtor were to be liquidated on the insolvency commencement date',
   'The discounted cash flow value assuming business continuity for 10 years',
   'The enterprise valuation based on market capitalization of comparable listed peers',
   'B', 'Regulation 2(1)(k) of IBBI (CIRP) Regulations defines "liquidation value" as the estimated realizable value of the assets of the corporate debtor if the corporate debtor were to be liquidated on the insolvency commencement date.', 1, 'Finance,Valuation,LiquidationValue'],

  ['Finance & Accounts', 'Financial Statements', 2, 'mcq',
   'Which financial ratio measures the ability of a corporate debtor to service its total debt payments (both principal repayments and interest) from its operating profits?',
   'Current Ratio',
   'Debt Service Coverage Ratio (DSCR)',
   'Price-to-Earnings Ratio (P/E)',
   'Asset Turnover Ratio',
   'B', 'The Debt Service Coverage Ratio (DSCR) = (Net Operating Income) / (Total Debt Service [Principal + Interest]). It is the primary metric evaluated by CoC during resolution plan assessment.', 1, 'Finance,Ratios,DSCR'],

  // ─── Case Laws ─────────────────────────────────────────────────────
  ['IBC', 'Landmark Judgments', 2, 'mcq',
   'In the landmark Supreme Court ruling of Innoventive Industries Ltd. v. ICICI Bank (2018), what principle did the Supreme Court lay down regarding Section 7 applications?',
   'The NCLT has broad discretion to reject applications if the corporate debtor promises future revival',
   'Once the adjudicating authority is satisfied that a default of the threshold amount has occurred, the application must be admitted; claims of set-off or counter-claims cannot be entertained',
   'Financial creditors must obtain prior approval from the Central Government before filing',
   'Section 7 applications cannot be admitted if an arbitration proceeding is pending',
   'B', 'In Innoventive Industries (2018), the Supreme Court ruled that once NCLT is satisfied that a financial debt exists and default has occurred, NCLT has no discretion and must admit the Section 7 application immediately.', 1, 'CaseLaws,Innoventive,Section7'],

  ['IBC', 'Landmark Judgments', 2, 'mcq',
   'In Committee of Creditors of Essar Steel India Ltd. v. Satish Kumar Gupta (SC 2019), what did the Supreme Court hold regarding the commercial wisdom of the Committee of Creditors?',
   'Commercial wisdom of the CoC is subject to merit review and revision by NCLT on grounds of fairness',
   'The commercial wisdom of the CoC is supreme and non-justiciable; NCLT cannot enter into the merits of business decisions regarding distribution of funds',
   'Operational creditors must receive equal percentage payments as secured financial creditors',
   'Resolution applicants must pay 100% of all dues to all creditors without exception',
   'B', 'In Essar Steel (SC 2019), the Supreme Court held that the commercial wisdom of the CoC is paramount and non-justiciable. Neither NCLT nor NCLAT has the jurisdiction to alter or overturn the business decisions of the CoC on fund distribution.', 1, 'CaseLaws,EssarSteel,CommercialWisdom'],

  ['IBC', 'Landmark Judgments', 2, 'mcq',
   'In Mobilox Innovations Pvt. Ltd. v. Kirusa Software Pvt. Ltd. (SC 2018), what standard did the Supreme Court establish for "existence of a dispute" under Section 8 and 9 of IBC?',
   'The dispute must be proven beyond reasonable doubt before a civil court',
   'The dispute must be a genuine, bona fide dispute not a patently feeble or spurious legal defence, raised prior to receipt of demand notice',
   'A dispute is only valid if an arbitration award has already been passed',
   'Any oral protest made after receiving the demand notice qualifies as a pre-existing dispute',
   'B', 'In Mobilox Innovations (SC 2018), the Supreme Court ruled that under Section 9, NCLT only needs to see whether there exists a plausible contention requiring investigation (pre-existing dispute) raised before receipt of the Section 8 demand notice.', 1, 'CaseLaws,Mobilox,Dispute']
];

const insertQ = db.prepare(`
  INSERT INTO questions (topic, subtopic, difficulty, type, question, option_a, option_b, option_c, option_d, correct_answer, explanation, marks, tags)
  VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
`);

let inserted = 0;
for (const q of additionalQuestions) {
  const exists = db.prepare('SELECT id FROM questions WHERE question = ?').get(q[4]);
  if (!exists) {
    insertQ.run(...q);
    inserted++;
  }
}

console.log(`Inserted ${inserted} new high-yield questions!`);
console.log('Total questions in DB now:', db.prepare('SELECT count(*) as c FROM questions').get().c);

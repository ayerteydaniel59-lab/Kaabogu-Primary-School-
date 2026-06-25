import { useState, useEffect } from 'react';
import { 
  School, 
  FileSpreadsheet, 
  Download, 
  Edit, 
  Search, 
  Users, 
  Sliders, 
  BookOpen, 
  Database, 
  CheckCircle, 
  AlertCircle,
  FileText,
  UserCheck,
  RefreshCw,
  TrendingUp,
  LayoutGrid,
  Maximize2,
  Minimize2,
  PlusCircle,
  LogOut,
  ChevronRight
} from 'lucide-react';
import { motion, AnimatePresence } from 'motion/react';
import { Learner, AssessmentMetadata, SubjectScore } from './types';
import { 
  INITIAL_METADATA, 
  SUBJECTS, 
  INITIAL_CLASS_4_LEARNERS, 
  INITIAL_CLASS_5_LEARNERS 
} from './data';
import { generateExcelFile } from './excelGenerator';
import { 
  tryInitFirebase, 
  loginWithGoogle, 
  logout, 
  syncToGoogleSheets,
  getCurrentUser,
  getCachedToken
} from './googleSheetsSync';

// 2. Format Initial Raw Transcription data to rich state object
function formatInitialLearners(rawLearners: any[]): Learner[] {
  const formatted = rawLearners.map((rl) => {
    const scoresRecord: Record<string, SubjectScore> = {};
    
    SUBJECTS.forEach((sub) => {
      const rawCA = rl.scores[sub.id];
      const caScore = rawCA !== undefined ? rawCA : null;
      const caConverted = caScore !== null ? caScore / 2 : null;
      
      // Mid-Term test starts with blank/null exam score
      scoresRecord[sub.id] = {
        subjectId: sub.id,
        subjectName: sub.name,
        caScore,
        caConverted,
        examScore: null,
        examConverted: null,
        subjectTotal: caConverted // Total is just CA at first since exam is empty
      };
    });

    return {
      id: rl.id,
      name: rl.name,
      scores: scoresRecord,
      overallTotal: 0,
      averageScore: 0,
      grade: 'F',
      position: 1
    };
  });

  return recalculateClassMetrics(formatted);
}

// 3. Dynamic Calculation Engine (recomputes converted values, totals, grades, and RANK.EQ position)
function recalculateClassMetrics(learnersList: Learner[]): Learner[] {
  // Stage 1: Calculate individual totals & averages
  const withTotals = learnersList.map((learner) => {
    let totalSum = 0;
    let count = 0;

    const updatedScores = { ...learner.scores };

    SUBJECTS.forEach((sub) => {
      const score = updatedScores[sub.id];
      const caVal = score.caScore;
      const examVal = score.examScore;

      const caConverted = caVal !== null ? caVal / 2 : null;
      const examConverted = examVal !== null ? examVal / 2 : null;
      
      let subjectTotal: number | null = null;
      if (caConverted !== null || examConverted !== null) {
        subjectTotal = (caConverted ?? 0) + (examConverted ?? 0);
        totalSum += subjectTotal;
        count++;
      }

      updatedScores[sub.id] = {
        ...score,
        caConverted,
        examConverted,
        subjectTotal
      };
    });

    // Overall average: standard GES syllabus divider is the total subject count (7)
    const averageScore = Number((totalSum / SUBJECTS.length).toFixed(1));

    // Grading Criteria (80-100 A, 70-79 B+, 60-69 B, 50-59 C, 40-49 D, <40 F)
    let grade = 'F';
    if (averageScore >= 80) grade = 'A';
    else if (averageScore >= 70) grade = 'B+';
    else if (averageScore >= 60) grade = 'B';
    else if (averageScore >= 50) grade = 'C';
    else if (averageScore >= 40) grade = 'D';

    return {
      ...learner,
      scores: updatedScores,
      overallTotal: totalSum,
      averageScore,
      grade
    };
  });

  // Stage 2: Calculate Positions matching Excel's RANK.EQ
  const sorted = [...withTotals].sort((a, b) => b.overallTotal - a.overallTotal);
  let currentRank = 1;

  const rankMap: Record<string, number> = {};
  for (let i = 0; i < sorted.length; i++) {
    if (i > 0 && sorted[i].overallTotal < sorted[i - 1].overallTotal) {
      currentRank = i + 1;
    }
    rankMap[sorted[i].id] = currentRank;
  }

  return withTotals.map((learner) => ({
    ...learner,
    position: rankMap[learner.id] || 1
  }));
}

export default function App() {
  // 1. App State
  const [metadata, setMetadata] = useState<AssessmentMetadata>(INITIAL_METADATA);
  const [activeTab, setActiveTab] = useState<'Class 4' | 'Class 5'>('Class 4');
  const [viewMode, setViewMode] = useState<'classic' | 'spreadsheet'>('classic');
  const [searchQuery, setSearchQuery] = useState('');
  
  // Learners mutable state (including CA from images)
  const [class4Learners, setClass4Learners] = useState<Learner[]>(() => 
    formatInitialLearners(INITIAL_CLASS_4_LEARNERS)
  );
  const [class5Learners, setClass5Learners] = useState<Learner[]>(() => 
    formatInitialLearners(INITIAL_CLASS_5_LEARNERS)
  );

  // Editor Modal state
  const [selectedLearner, setSelectedLearner] = useState<Learner | null>(null);
  const [editScores, setEditScores] = useState<Record<string, { ca: number | null, exam: number | null }>>({});

  // Google Sync state
  const [isFirebaseEnabled, setIsFirebaseEnabled] = useState(false);
  const [googleUser, setGoogleUser] = useState<any>(null);
  const [isSyncing, setIsSyncing] = useState(false);
  const [syncStatus, setSyncStatus] = useState<{ type: 'success' | 'error' | null; msg: string; url?: string }>({
    type: null,
    msg: ''
  });

  // Init Firebase check
  useEffect(() => {
    tryInitFirebase().then((enabled) => {
      setIsFirebaseEnabled(enabled);
      setGoogleUser(getCurrentUser());
    });
  }, []);

  // 4. Quick Actions: Populate Mock Exam Scores
  const handlePopulateMockExams = () => {
    const updateHelper = (learners: Learner[]) => {
      const updated = learners.map((l) => {
        const newScores = { ...l.scores };
        SUBJECTS.forEach((sub) => {
          const caRaw = newScores[sub.id].caScore;
          // Generate realistic exam score around the Continuous Assessment value
          const examScore = caRaw !== null 
            ? Math.min(100, Math.max(10, Math.round(caRaw + (Math.random() * 20 - 10)))) 
            : Math.round(Math.random() * 40 + 45); // Default pass-range score if CA was absent
          
          newScores[sub.id] = {
            ...newScores[sub.id],
            examScore
          };
        });
        return { ...l, scores: newScores };
      });
      return recalculateClassMetrics(updated);
    };

    if (activeTab === 'Class 4') {
      setClass4Learners(prev => updateHelper(prev));
    } else {
      setClass5Learners(prev => updateHelper(prev));
    }
  };

  const handleClearExams = () => {
    const clearHelper = (learners: Learner[]) => {
      const updated = learners.map((l) => {
        const newScores = { ...l.scores };
        SUBJECTS.forEach((sub) => {
          newScores[sub.id] = {
            ...newScores[sub.id],
            examScore: null,
            examConverted: null,
            subjectTotal: newScores[sub.id].caConverted
          };
        });
        return { ...l, scores: newScores };
      });
      return recalculateClassMetrics(updated);
    };

    if (activeTab === 'Class 4') {
      setClass4Learners(prev => clearHelper(prev));
    } else {
      setClass5Learners(prev => clearHelper(prev));
    }
  };

  // 5. Save Score quick-editor callback
  const handleOpenEditor = (learner: Learner) => {
    setSelectedLearner(learner);
    const initialEditState: Record<string, { ca: number | null; exam: number | null }> = {};
    SUBJECTS.forEach((sub) => {
      initialEditState[sub.id] = {
        ca: learner.scores[sub.id]?.caScore ?? null,
        exam: learner.scores[sub.id]?.examScore ?? null
      };
    });
    setEditScores(initialEditState);
  };

  const handleSaveEditor = () => {
    if (!selectedLearner) return;

    const saveHelper = (learners: Learner[]) => {
      const updated = learners.map((l) => {
        if (l.id !== selectedLearner.id) return l;

        const newScores = { ...l.scores };
        SUBJECTS.forEach((sub) => {
          const caRaw = editScores[sub.id]?.ca;
          const examRaw = editScores[sub.id]?.exam;

          newScores[sub.id] = {
            ...newScores[sub.id],
            caScore: caRaw !== undefined ? caRaw : null,
            examScore: examRaw !== undefined ? examRaw : null
          };
        });

        return { ...l, scores: newScores };
      });
      return recalculateClassMetrics(updated);
    };

    if (activeTab === 'Class 4') {
      setClass4Learners(prev => saveHelper(prev));
    } else {
      setClass5Learners(prev => saveHelper(prev));
    }

    setSelectedLearner(null);
  };

  // 6. Export local Excel workbook (.xlsx)
  const handleDownloadExcel = () => {
    const blob = generateExcelFile(metadata, class4Learners, class5Learners);
    const url = window.URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `${metadata.schoolName.replace(/\s+/g, '_')}_Student_Assessment_Book_2026.xlsx`;
    document.body.appendChild(a);
    a.click();
    window.URL.revokeObjectURL(url);
    document.body.removeChild(a);
  };

  // 7. Sync to Google Sheets workflow (Oauth + Google Workspace)
  const handleGoogleLogin = async () => {
    try {
      setSyncStatus({ type: null, msg: '' });
      const res = await loginWithGoogle();
      if (res) {
        setGoogleUser(res.user);
      }
    } catch (err: any) {
      setSyncStatus({ type: 'error', msg: err.message || 'Login failed.' });
    }
  };

  const handleSyncToSheets = async () => {
    const confirmation = window.confirm(
      `Synchronize records for Class 4 and Class 5 into a new, beautifully formatted spreadsheet in your Google Drive folder?`
    );
    if (!confirmation) return;

    setIsSyncing(true);
    setSyncStatus({ type: null, msg: 'Initializing spreadsheet framework on Cloud...' });

    try {
      const url = await syncToGoogleSheets(metadata, class4Learners, class5Learners);
      setSyncStatus({
        type: 'success',
        msg: 'Successfully synchronized to Google Sheets!',
        url
      });
    } catch (err: any) {
      console.error(err);
      setSyncStatus({
        type: 'error',
        msg: err.message || 'Synchronization failed. Please check permissions.'
      });
    } finally {
      setIsSyncing(false);
    }
  };

  const handleSignOut = () => {
    logout();
    setGoogleUser(null);
    setSyncStatus({ type: null, msg: '' });
  };

  // 8. Stats calculations for visual dashboard cards
  const activeLearners = activeTab === 'Class 4' ? class4Learners : class5Learners;
  const filteredLearners = activeLearners.filter((l) =>
    l.name.toLowerCase().includes(searchQuery.toLowerCase())
  );

  const averages = filteredLearners.map(l => l.averageScore);
  const highestAverage = averages.length > 0 ? Math.max(...averages) : 0;
  const lowestAverage = averages.length > 0 ? Math.min(...averages) : 0;
  const classAverage = averages.length > 0 ? Number((averages.reduce((a, b) => a + b, 0) / averages.length).toFixed(1)) : 0;
  const numberPassed = filteredLearners.filter(l => l.averageScore >= 40).length;
  const numberFailed = filteredLearners.filter(l => l.averageScore < 40).length;

  return (
    <div id="ges-app-container" className="min-h-screen bg-[#F8FAFC] text-slate-800 font-sans selection:bg-[#E2E8F0]">
      {/* 1. Dashboard Banner Header */}
      <header id="dashboard-banner-header" className="relative bg-gradient-to-r from-emerald-800 via-teal-900 to-[#1e293b] text-white py-8 px-6 shadow-md overflow-hidden">
        <div className="absolute top-0 right-0 w-96 h-96 bg-yellow-500/10 rounded-full blur-3xl -mr-20 -mt-20"></div>
        <div className="max-w-7xl mx-auto flex flex-col md:flex-row justify-between items-start md:items-center gap-6 relative">
          
          <div className="flex items-center gap-4">
            <div id="banner-icon-bg" className="bg-emerald-600/30 p-3 rounded-2xl border border-emerald-500/30 backdrop-blur-sm">
              <School className="w-10 h-10 text-yellow-400" />
            </div>
            <div>
              <div className="flex items-center gap-2">
                <span id="ges-badge" className="px-2.5 py-0.5 bg-yellow-400 text-slate-900 text-xs font-bold rounded-full tracking-wider uppercase">
                  GES Specialist
                </span>
                <span id="assessment-date" className="text-emerald-300 text-xs font-medium">Mid-Term: 18/06/2026</span>
              </div>
              <h1 id="main-headline" className="text-2xl md:text-3xl font-bold tracking-tight mt-1 text-white">
                {metadata.schoolName}
              </h1>
              <p id="sub-headline" className="text-slate-300 text-sm mt-0.5 font-normal">
                Continuous Assessment & Exam Matrix Portal • Ghana Education Service Guidelines
              </p>
            </div>
          </div>

          {/* Quick Stats Banner Widgets */}
          <div id="quick-action-button-group" className="flex items-center gap-3">
            <button
              id="btn-download-excel"
              onClick={handleDownloadExcel}
              className="flex items-center gap-2 px-4 py-2.5 bg-yellow-500 hover:bg-yellow-600 text-slate-900 font-semibold rounded-xl text-sm transition-all shadow-sm active:scale-95"
            >
              <Download className="w-4 h-4" /> Download MS Excel (.xlsx)
            </button>

            {googleUser ? (
              <button
                id="btn-sync-sheets"
                onClick={handleSyncToSheets}
                disabled={isSyncing}
                className="flex items-center gap-2 px-4 py-2.5 bg-sky-600 hover:bg-sky-500 disabled:bg-sky-800 text-white font-semibold rounded-xl text-sm transition-all shadow-sm active:scale-95"
              >
                <Database className="w-4 h-4" /> {isSyncing ? 'Syncing...' : 'Sync Google Sheets'}
              </button>
            ) : (
              <button
                id="btn-google-sign-in"
                onClick={handleGoogleLogin}
                className="flex items-center gap-2 px-4 py-2.5 bg-slate-800 hover:bg-slate-700 text-white font-medium rounded-xl text-sm border border-slate-750 transition-all shadow-sm"
              >
                <Database className="w-4 h-4 text-sky-400" /> Sign In & Sync Drive
              </button>
            )}
          </div>

        </div>
      </header>

      {/* Main Container */}
      <main id="main-content-layout" className="max-w-7xl mx-auto px-4 sm:px-6 py-8">
        
        {/* Status Alerts banner */}
        {syncStatus.msg && (
          <div id="alert-banner" className={`mb-6 p-4 rounded-xl border flex items-start gap-3 ${
            syncStatus.type === 'success' 
              ? 'bg-emerald-50 border-emerald-200 text-emerald-800' 
              : 'bg-rose-50 border-rose-200 text-rose-800'
          }`}>
            {syncStatus.type === 'success' ? (
              <CheckCircle className="w-5 h-5 text-emerald-600 shrink-0 mt-0.5" />
            ) : (
              <AlertCircle className="w-5 h-5 text-rose-600 shrink-0 mt-0.5" />
            )}
            <div className="flex-1">
              <p className="font-medium text-sm">{syncStatus.msg}</p>
              {syncStatus.url && (
                <a 
                  href={syncStatus.url} 
                  target="_blank" 
                  referrerPolicy="no-referrer"
                  className="text-xs decoration-dashed underline font-semibold mt-1 inline-block text-sky-600 hover:text-sky-700"
                >
                  Open Created Spreadsheet File <ChevronRight className="w-3 h-3 inline" />
                </a>
              )}
            </div>
          </div>
        )}

        <div className="grid grid-cols-1 lg:grid-cols-4 gap-8">
          
          {/* LEFT PANEL: Metadata and Configuration Settings */}
          <div id="side-configuration-panel" className="lg:col-span-1 flex flex-col gap-6">
            
            {/* School particulars form sheet card */}
            <div className="bg-white p-6 rounded-2xl shadow-sm border border-slate-100">
              <div className="flex items-center gap-2.5 border-b border-slate-100 pb-4 mb-4">
                <School className="w-5 h-5 text-emerald-600" />
                <h2 className="font-bold text-slate-800 text-base">GES School Register</h2>
              </div>

              <div id="metadata-field-form" className="space-y-3.5 text-xs">
                <div>
                  <label className="block text-[11px] font-semibold text-slate-500 uppercase tracking-wider mb-1">School Name</label>
                  <input
                    type="text"
                    value={metadata.schoolName}
                    onChange={(e) => setMetadata({ ...metadata, schoolName: e.target.value })}
                    className="w-full px-3 py-2 bg-slate-50 border border-slate-200 rounded-lg focus:outline-none focus:border-emerald-500 focus:bg-white transition-colors"
                  />
                </div>

                <div>
                  <label className="block text-[11px] font-semibold text-slate-500 uppercase tracking-wider mb-1">EMIS Code</label>
                  <input
                    type="text"
                    value={metadata.emisCode}
                    onChange={(e) => setMetadata({ ...metadata, emisCode: e.target.value })}
                    className="w-full px-3 py-2 bg-slate-50 border border-slate-200 rounded-lg focus:outline-none focus:border-emerald-500 focus:bg-white transition-colors font-mono"
                  />
                </div>

                <div>
                  <label className="block text-[11px] font-semibold text-slate-500 uppercase tracking-wider mb-1">Circuit Particulars</label>
                  <input
                    type="text"
                    value={metadata.circuit}
                    onChange={(e) => setMetadata({ ...metadata, circuit: e.target.value })}
                    className="w-full px-3 py-2 bg-slate-50 border border-slate-200 rounded-lg focus:outline-none focus:border-emerald-500 focus:bg-white transition-colors"
                  />
                </div>

                <div>
                  <label className="block text-[11px] font-semibold text-slate-500 uppercase tracking-wider mb-1">District Municipality</label>
                  <input
                    type="text"
                    value={metadata.district}
                    onChange={(e) => setMetadata({ ...metadata, district: e.target.value })}
                    className="w-full px-3 py-2 bg-slate-50 border border-slate-200 rounded-lg focus:outline-none focus:border-emerald-500 focus:bg-white transition-colors"
                  />
                </div>

                <div className="grid grid-cols-2 gap-2">
                  <div>
                    <label className="block text-[11px] font-semibold text-slate-500 uppercase tracking-wider mb-1">Academic Year</label>
                    <input
                      type="text"
                      value={metadata.academicYear}
                      onChange={(e) => setMetadata({ ...metadata, academicYear: e.target.value })}
                      className="w-full px-3 py-2 bg-slate-50 border border-slate-200 rounded-lg focus:outline-none focus:border-emerald-500 focus:bg-white transition-colors"
                    />
                  </div>
                  <div>
                    <label className="block text-[11px] font-semibold text-slate-500 uppercase tracking-wider mb-1">Term</label>
                    <input
                      type="text"
                      value={metadata.term}
                      onChange={(e) => setMetadata({ ...metadata, term: e.target.value })}
                      className="w-full px-3 py-2 bg-slate-50 border border-slate-200 rounded-lg focus:outline-none focus:border-emerald-500 focus:bg-white transition-colors"
                    />
                  </div>
                </div>

                <div className="pt-2 border-t border-slate-100 mt-2">
                  <label className="block text-[11px] font-semibold text-slate-500 uppercase tracking-wider mb-1">
                    {activeTab === 'Class 4' ? 'Class 4' : 'Class 5'} Teacher
                  </label>
                  <input
                    type="text"
                    value={activeTab === 'Class 4' ? metadata.teacherNameClass4 : metadata.teacherNameClass5}
                    onChange={(e) => {
                      if (activeTab === 'Class 4') {
                        setMetadata({ ...metadata, teacherNameClass4: e.target.value });
                      } else {
                        setMetadata({ ...metadata, teacherNameClass5: e.target.value });
                      }
                    }}
                    className="w-full px-3 py-2 bg-slate-50 border border-slate-200 rounded-lg focus:outline-none focus:border-emerald-500 focus:bg-white transition-colors"
                  />
                </div>
              </div>
            </div>

            {/* Google Drive credentials information widget */}
            <div id="drive-sync-widget" className="bg-slate-900 text-white p-5 rounded-2xl shadow-sm border border-slate-800">
              <div className="flex items-center gap-2 mb-3">
                <Database className="w-5 h-5 text-sky-400" />
                <h3 className="font-bold text-sm text-slate-100">Sheets Sync Console</h3>
              </div>
              <p className="text-slate-400 text-xs/relaxed mb-4">
                Sync the transcribed CA ledger dynamically with Google Sheets. Full formula trees automatically preserved.
              </p>

              {googleUser ? (
                <div id="guser-profile" className="space-y-3.5">
                  <div className="flex items-center gap-2.5 bg-slate-800 p-2.5 rounded-xl border border-slate-700">
                    {googleUser.photoURL ? (
                      <img 
                        src={googleUser.photoURL} 
                        alt="Avatar" 
                        referrerPolicy="no-referrer"
                        className="w-8 h-8 rounded-full border border-slate-600" 
                      />
                    ) : (
                      <div className="w-8 h-8 rounded-full bg-sky-500 flex items-center justify-center text-xs font-bold text-white uppercase">
                        {googleUser.email?.[0]}
                      </div>
                    )}
                    <div className="min-w-0 flex-1">
                      <p className="text-xs font-semibold truncate text-slate-200">{googleUser.displayName || 'Teacher User'}</p>
                      <p className="text-[10px] text-slate-400 truncate">{googleUser.email}</p>
                    </div>
                  </div>
                  <div className="flex gap-2">
                    <button
                      id="btn-sync-submit"
                      onClick={handleSyncToSheets}
                      disabled={isSyncing}
                      className="flex-1 py-2 text-center bg-sky-500 hover:bg-sky-400 text-slate-950 font-bold text-xs rounded-lg active:scale-95 transition-all cursor-pointer"
                    >
                      {isSyncing ? 'Syncing...' : 'Sync Now'}
                    </button>
                    <button
                      id="btn-sign-out"
                      onClick={handleSignOut}
                      className="px-2.5 py-2 text-slate-400 hover:text-white bg-slate-800 hover:bg-slate-700 rounded-lg transition-colors cursor-pointer"
                      title="Deauthorize Sync"
                    >
                      <LogOut className="w-3.5 h-3.5" />
                    </button>
                  </div>
                </div>
              ) : (
                <button
                  id="btn-google-drive-link"
                  onClick={handleGoogleLogin}
                  className="w-full py-2.5 flex items-center justify-center gap-2 bg-slate-800 hover:bg-slate-755 hover:border-slate-600 transition-all border border-slate-700 text-slate-200 font-medium text-xs rounded-xl active:scale-95 cursor-pointer"
                >
                  <svg className="w-4 h-4" viewBox="0 0 48 48">
                    <path fill="#EA4335" d="M24 9.5c3.54 0 6.71 1.22 9.21 3.6l6.85-6.85C35.9 2.38 30.47 0 24 0 14.62 0 6.51 5.38 2.56 13.22l7.98 6.19C12.43 13.72 17.74 9.5 24 9.5z"></path>
                    <path fill="#4285F4" d="M46.98 24.55c0-1.57-.15-3.09-.38-4.55H24v9.02h12.94c-.58 2.96-2.26 5.48-4.78 7.18l7.73 6c4.51-4.18 7.09-10.36 7.09-17.65z"></path>
                    <path fill="#FBBC05" d="M10.53 28.59c-.48-1.45-.76-2.99-.76-4.59s.27-3.14.76-4.59l-7.98-6.19C.92 16.46 0 20.12 0 24c0 3.88.92 7.54 2.56 10.78l7.97-6.19z"></path>
                    <path fill="#34A853" d="M24 48c6.48 0 11.93-2.13 15.89-5.81l-7.73-6c-2.15 1.45-4.92 2.3-8.16 2.3-6.26 0-11.57-4.22-13.47-9.91l-7.98 6.19C6.51 42.62 14.62 48 24 48z"></path>
                  </svg>
                  Connect Google Sheets
                </button>
              )}
            </div>

          </div>

          {/* RIGHT VIEW: Records List, spreadsheet, and statistics */}
          <div id="main-dash-content" className="lg:col-span-3 flex flex-col gap-6">
            
            {/* Class tabs and view selection */}
            <div className="flex flex-col sm:flex-row justify-between items-stretch sm:items-center gap-4 bg-white p-3 rounded-2xl shadow-sm border border-slate-100">
              
              {/* Class Switcher toggle */}
              <div id="class-switcher" className="flex bg-slate-100 p-1 rounded-xl">
                <button
                  id="tab-class4"
                  onClick={() => setActiveTab('Class 4')}
                  className={`px-4 py-2 font-bold text-xs rounded-lg transition-all ${
                    activeTab === 'Class 4' 
                      ? 'bg-white text-slate-800 shadow-sm' 
                      : 'text-slate-500 hover:text-slate-800'
                  }`}
                >
                  <Users className="w-3.5 h-3.5 inline mr-1.5" /> Class 4 (13 Students)
                </button>
                <button
                  id="tab-class5"
                  onClick={() => setActiveTab('Class 5')}
                  className={`px-4 py-2 font-bold text-xs rounded-lg transition-all ${
                    activeTab === 'Class 5' 
                      ? 'bg-white text-slate-800 shadow-sm' 
                      : 'text-slate-500 hover:text-slate-800'
                  }`}
                >
                  <Users className="w-3.5 h-3.5 inline mr-1.5" /> Class 5 (5 Students)
                </button>
              </div>

              {/* Action buttons list */}
              <div id="view-controls" className="flex items-center gap-2.5">
                
                <div className="flex bg-slate-100 p-1 rounded-xl">
                  <button
                    id="btn-view-classic"
                    onClick={() => setViewMode('classic')}
                    className={`px-3 py-1.5 font-semibold text-xs rounded-lg transition-all ${
                      viewMode === 'classic' 
                        ? 'bg-white text-slate-800 shadow-sm' 
                        : 'text-slate-500 hover:text-slate-800'
                    }`}
                    title="Condensed overview grid"
                  >
                    <LayoutGrid className="w-3.5 h-3.5 inline mr-1" /> List View
                  </button>
                  <button
                    id="btn-view-spreadsheet"
                    onClick={() => setViewMode('spreadsheet')}
                    className={`px-3 py-1.5 font-semibold text-xs rounded-lg transition-all ${
                      viewMode === 'spreadsheet' 
                        ? 'bg-white text-slate-800 shadow-sm' 
                        : 'text-slate-500 hover:text-slate-800'
                    }`}
                    title="Horizontal scrolling excel format"
                  >
                    <Maximize2 className="w-3.5 h-3.5 inline mr-1" /> Spreadsheet View
                  </button>
                </div>

              </div>

            </div>

            {/* GES Statistics Dashboard (Bento Grid Style) */}
            <div id="stats-dashboard-grid" className="grid grid-cols-2 md:grid-cols-5 gap-4">
              
              <div className="bg-white p-4 rounded-xl border border-slate-100 flex flex-col justify-between">
                <span className="text-[10px] font-bold text-slate-400 uppercase tracking-widest">School Level</span>
                <span className="text-xl font-bold text-slate-800 mt-2">{activeTab}</span>
                <span className="text-[10px] text-slate-500 mt-1">{filteredLearners.length} Registered</span>
              </div>

              <div className="bg-white p-4 rounded-xl border border-slate-100 flex flex-col justify-between">
                <span className="text-[10px] font-bold text-slate-400 uppercase tracking-widest">Class Average</span>
                <span className="text-xl font-bold text-teal-600 mt-2">{classAverage}%</span>
                <span className="text-[10px] text-slate-500 mt-1">Syllabus Median</span>
              </div>

              <div className="bg-white p-4 rounded-xl border border-slate-100 flex flex-col justify-between">
                <span className="text-[10px] font-bold text-slate-400 uppercase tracking-widest">Highest Student</span>
                <span className="text-xl font-bold text-emerald-600 mt-2">{highestAverage}%</span>
                <span className="text-[10px] text-slate-500 mt-1">Top Performer</span>
              </div>

              <div className="bg-white p-4 rounded-xl border border-emerald-100 bg-emerald-50/10 flex flex-col justify-between">
                <span className="text-[10px] font-bold text-emerald-600 uppercase tracking-widest">Total Passed</span>
                <span className="text-xl font-bold text-emerald-700 mt-2">{numberPassed} <span className="text-xs text-emerald-500">({filteredLearners.length > 0 ? Math.round((numberPassed/filteredLearners.length)*100) : 0}%)</span></span>
                <span className="text-[10px] text-emerald-600/70 mt-1">Average &gt;= 40</span>
              </div>

              <div className="bg-white p-4 rounded-xl border border-rose-100 bg-rose-50/10 flex flex-col justify-between">
                <span className="text-[10px] font-bold text-rose-600 uppercase tracking-widest">Total Failed</span>
                <span className="text-xl font-bold text-rose-700 mt-2">{numberFailed} <span className="text-xs text-rose-500">({filteredLearners.length > 0 ? Math.round((numberFailed/filteredLearners.length)*100) : 0}%)</span></span>
                <span className="text-[10px] text-rose-600/70 mt-1">Average &lt; 40</span>
              </div>

            </div>

            {/* Quick Demo Controllers banner */}
            <div className="p-4 bg-[#fefeeb] border border-yellow-200/60 rounded-2xl flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4">
              <div className="flex items-center gap-2.5">
                <Sliders className="w-5 h-5 text-yellow-600 shrink-0" />
                <div>
                  <p className="font-bold text-xs text-slate-800">Term Exam Score Simulation Tool</p>
                  <p className="text-[11px] text-slate-500">Mid-term image provides raw continuous assessments (CA). Simulate end-of-term exams to test grade ranges!</p>
                </div>
              </div>
              <div className="flex items-center gap-2 w-full sm:w-auto shrink-0">
                <button
                  id="btn-demo-fill"
                  onClick={handlePopulateMockExams}
                  className="flex-1 sm:flex-none px-3.5 py-1.5 text-xs bg-emerald-600 hover:bg-emerald-500 text-white font-bold rounded-lg cursor-pointer transition-colors shadow-sm"
                  title="Generate realistic term scores"
                >
                  🧪 Fill Demo Exams
                </button>
                <button
                  id="btn-demo-clear"
                  onClick={handleClearExams}
                  className="flex-1 sm:flex-none px-3.5 py-1.5 text-xs bg-slate-250 hover:bg-slate-300 text-slate-700 font-semibold rounded-lg cursor-pointer transition-colors"
                  title="Clear exams to start template blank"
                >
                  🧹 Clear Exams
                </button>
              </div>
            </div>

            {/* Assessment search filter bar */}
            <div className="flex bg-white p-3 rounded-xl border border-slate-100 items-center gap-3">
              <Search className="w-4 h-4 text-slate-400 shrink-0 ml-1" />
              <input
                type="text"
                placeholder="Search registered learners by name..."
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                className="w-full text-sm bg-transparent border-none placeholder-slate-400 outline-none"
              />
            </div>

            {/* CLASS ASSESSMENT LEDGER */}
            <div className="bg-white rounded-2xl shadow-sm border border-slate-100 overflow-hidden">
              
              {viewMode === 'spreadsheet' ? (
                /* SPREADSHEET HORIZONTAL SCROLL ENHANCED METRIC GRID */
                <div id="full-scrollable-spreadsheet" className="overflow-x-auto">
                  <table className="w-full text-xs text-left border-collapse border-slate-100">
                    <thead className="bg-[#f8fafc]">
                      
                      {/* Row 1: Merged title blocks */}
                      <tr>
                        <th className="px-3 py-3 border border-slate-200 text-slate-500 font-bold sticky left-0 bg-[#f8fafc] z-10" rowSpan={3}>Roll</th>
                        <th className="px-4 py-3 border border-slate-200 text-slate-500 font-bold sticky left-[45px] bg-[#f8fafc] z-10" rowSpan={3}>Student Name</th>
                        {SUBJECTS.map(sub => (
                          <th key={sub.id} className="text-center font-bold text-slate-700 border border-slate-200 py-1" colSpan={5}>
                            {sub.name}
                          </th>
                        ))}
                        <th className="text-center font-bold text-teal-800 border-l-2 border-r border-y border-teal-200" colSpan={4}>CLASS ASSESSMENT SUMMARIES</th>
                      </tr>

                      {/* Row 2: Sub-headers */}
                      <tr>
                        {SUBJECTS.map(sub => (
                          <>
                            <th className="px-2 py-1 border border-slate-200 text-center font-semibold text-slate-600 bg-slate-50">CA</th>
                            <th className="px-2 py-1 border border-slate-200 text-center font-semibold text-slate-500 bg-[#fefef0]">CA 50%</th>
                            <th className="px-2 py-1 border border-slate-200 text-center font-semibold text-slate-600 bg-slate-50">Exam</th>
                            <th className="px-2 py-1 border border-slate-200 text-center font-semibold text-slate-500 bg-[#fefef0]">Exam 50%</th>
                            <th className="px-2 py-1 border border-slate-200 text-center font-bold text-emerald-800 bg-emerald-50/30">Total</th>
                          </>
                        ))}
                        <th className="px-2 py-1 border-l-2 border-slate-200 text-center font-semibold bg-slate-200 text-slate-700">Total</th>
                        <th className="px-2 py-1 border border-slate-200 text-center font-semibold bg-slate-200 text-slate-700">Average</th>
                        <th className="px-2 py-1 border border-slate-200 text-center font-semibold bg-slate-200 text-slate-700">Grade</th>
                        <th className="px-2 py-1 border-r border-slate-200 text-center font-semibold bg-slate-200 text-slate-700">Position</th>
                      </tr>

                      {/* Row 3: weight markers */}
                      <tr>
                        {SUBJECTS.map(sub => (
                          <>
                            <th className="text-[10px] text-slate-400 font-normal border border-slate-200 text-center">(100)</th>
                            <th className="text-[10px] text-slate-400 font-normal border border-slate-200 text-center">(50)</th>
                            <th className="text-[10px] text-slate-400 font-normal border border-slate-200 text-center">(100)</th>
                            <th className="text-[10px] text-slate-400 font-normal border border-slate-200 text-center">(50)</th>
                            <th className="text-[10px] text-slate-400 font-bold border border-slate-200 text-center text-emerald-700">(100)</th>
                          </>
                        ))}
                        <th className="text-[10px] text-slate-400 font-normal border-l-2 border-slate-200 text-center">(700)</th>
                        <th className="text-[10px] text-slate-400 font-normal border border-slate-200 text-center">(100%)</th>
                        <th className="text-[10px] text-slate-400 font-normal border border-slate-200 text-center">GES Scale</th>
                        <th className="text-[10px] text-slate-400 font-normal border-r border-slate-200 text-center">RANK.EQ</th>
                      </tr>

                    </thead>
                    
                    <tbody className="divide-y divide-slate-100">
                      {filteredLearners.map((learner, index) => (
                        <tr key={learner.id} className="hover:bg-slate-50 transition-colors">
                          <td className="px-3 py-3 border border-slate-100 text-center text-slate-400 font-medium sticky left-0 bg-white group-hover:bg-slate-50 z-10">{index + 1}</td>
                          <td className="px-4 py-3 border border-slate-100 font-bold text-slate-700 sticky left-[45px] bg-white group-hover:bg-slate-50 z-10 truncate min-w-[150px]">{learner.name}</td>
                          
                          {SUBJECTS.map(sub => {
                            const sc = learner.scores[sub.id];
                            return (
                              <>
                                <td className="px-2 py-3 border border-slate-100 text-center font-mono text-slate-600">{sc?.caScore ?? '-'}</td>
                                <td className="px-2 py-3 border border-slate-100 text-center font-mono text-slate-500 bg-[#fefef0]/30">{sc?.caConverted ?? '-'}</td>
                                <td className="px-2 py-3 border border-slate-100 text-center font-mono text-slate-650">{sc?.examScore ?? '-'}</td>
                                <td className="px-2 py-3 border border-slate-100 text-center font-mono text-slate-500 bg-[#fefef0]/30">{sc?.examConverted ?? '-'}</td>
                                <td className="px-2 py-3 border border-slate-100 text-center font-mono font-bold text-emerald-700 bg-emerald-50/10">{sc?.subjectTotal ?? '-'}</td>
                              </>
                            );
                          })}

                          {/* calculations columns */}
                          <td className="px-2 py-3 border-l-2 border-slate-200 text-center font-bold font-mono text-slate-700">{learner.overallTotal}</td>
                          <td className="px-2 py-3 border border-slate-100 text-center font-bold font-mono text-indigo-700 bg-indigo-50/10">{learner.averageScore}%</td>
                          <td className="px-2 py-3 border border-slate-100 text-center font-black">
                            <span className={`px-2 py-0.5 rounded text-[10px] ${
                              learner.grade === 'A' ? 'bg-emerald-100 text-emerald-800' :
                              learner.grade.startsWith('B') ? 'bg-indigo-100 text-indigo-800' :
                              learner.grade === 'C' ? 'bg-yellow-100 text-yellow-800' :
                              learner.grade === 'D' ? 'bg-orange-100 text-orange-800' :
                              'bg-rose-100 text-rose-800'
                            }`}>
                              {learner.grade}
                            </span>
                          </td>
                          <td className="px-2 py-3 border-r border-slate-100 text-center font-extrabold text-slate-700">{learner.position}</td>
                        </tr>
                      ))}
                    </tbody>

                  </table>
                </div>
              ) : (
                /* CONDENSED STANDARD WEB OVERVIEW GRID WITH DIRECT QUICK EDITOR TRIGGER */
                <div id="condensed-standard-table" className="overflow-x-auto">
                  <table className="w-full text-xs text-left border-collapse">
                    <thead className="bg-[#f8fafc] border-b border-slate-100">
                      <tr>
                        <th className="px-4 py-4 text-center font-bold text-slate-400 w-12">No.</th>
                        <th className="px-4 py-4 font-bold text-slate-700">Learner Name</th>
                        {SUBJECTS.map((sub) => (
                          <th key={sub.id} className="px-2 py-4 text-center font-bold text-slate-600 bg-slate-50/50" title={sub.name}>
                            {sub.short} (100)
                          </th>
                        ))}
                        <th className="px-3 py-4 text-center font-bold text-indigo-800">Average</th>
                        <th className="px-3 py-4 text-center font-bold text-slate-700">Grade</th>
                        <th className="px-3 py-4 text-center font-bold text-slate-700">Rank.EQ</th>
                        <th className="px-4 py-4 text-center font-bold text-slate-700 w-24">Actions</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-100">
                      {filteredLearners.map((learner, index) => (
                        <tr key={learner.id} className="hover:bg-slate-50/60 transition-colors group">
                          
                          <td className="px-4 py-3.5 text-center text-slate-400 font-medium">
                            {index + 1}
                          </td>
                          
                          <td className="px-4 py-3.5 font-bold text-slate-800">
                            {learner.name}
                          </td>
                          
                          {/* Subject Score totals rendering */}
                          {SUBJECTS.map((sub) => {
                            const sc = learner.scores[sub.id];
                            const total = sc?.subjectTotal;
                            return (
                              <td key={sub.id} className="px-2 py-3.5 text-center font-mono">
                                <span className={total !== null ? 'font-bold text-slate-700' : 'text-slate-300'}>
                                  {total !== null ? total : '-'}
                                </span>
                              </td>
                            );
                          })}

                          <td className="px-3 py-3.5 text-center font-mono font-extrabold text-indigo-700">
                            {learner.averageScore}%
                          </td>

                          <td className="px-3 py-3.5 text-center">
                            <span className={`inline-flex items-center justify-center w-8 py-0.5 rounded font-black text-[10px] ${
                              learner.grade === 'A' ? 'bg-emerald-100 text-emerald-800' :
                              learner.grade.startsWith('B') ? 'bg-indigo-100 text-indigo-800' :
                              learner.grade === 'C' ? 'bg-yellow-100 text-yellow-800' :
                              learner.grade === 'D' ? 'bg-orange-100 text-orange-800' :
                              'bg-rose-100 text-rose-800'
                            }`}>
                              {learner.grade}
                            </span>
                          </td>

                          <td className="px-3 py-3.5 text-center font-extrabold text-slate-600">
                            {learner.position}
                          </td>

                          <td className="px-4 py-3.5 text-center">
                            <button
                              id={`btn-edit-${learner.id}`}
                              onClick={() => handleOpenEditor(learner)}
                              className="px-2 py-1 border border-slate-200 hover:border-emerald-500 hover:bg-emerald-55 border-dashed rounded text-[11px] font-bold text-slate-600 hover:text-emerald-700 inline-flex items-center gap-1 transition-colors cursor-pointer"
                            >
                              <Edit className="w-3 h-3" /> Edit Marks
                            </button>
                          </td>

                        </tr>
                      ))}

                      {filteredLearners.length === 0 && (
                        <tr>
                          <td colSpan={SUBJECTS.length + 5} className="text-center py-12 text-slate-400">
                            No registered learners match current workspace query.
                          </td>
                        </tr>
                      )}

                    </tbody>
                  </table>
                </div>
              )}

            </div>

            {/* Print landscape help notes */}
            <div className="bg-white p-5 rounded-2xl border border-slate-100 flex items-start gap-4">
              <FileSpreadsheet className="w-8 h-8 text-emerald-600 shrink-0 mt-0.5" />
              <div className="text-xs/relaxed">
                <p className="font-bold text-slate-800 text-sm mb-1">MS Excel Format Professional Features Included</p>
                <p className="text-slate-500">
                  The generated ledger workbook is perfectly customized to fit on an <span className="font-semibold text-slate-700">A4 Landscape</span> paper margin. 
                  Headers are colorized featuring gold-yellow dividers with frozen columns. Formulas are dynamically built using Excel equations, meaning you can open this sheet in Microsoft Excel or Google Sheets and type new values immediately—resulting in automatic ranking calculations without manual edits!
                </p>
              </div>
            </div>

          </div>

        </div>
      </main>

      {/* 9. MODAL SCORE EDITOR DRAWER */}
      <AnimatePresence>
        {selectedLearner && (
          <div id="modal-score-editor-overlay" className="fixed inset-0 bg-slate-900/60 backdrop-blur-xs flex items-center justify-center z-50 p-4">
            <motion.div 
              initial={{ scale: 0.95, opacity: 0 }}
              animate={{ scale: 1, opacity: 1 }}
              exit={{ scale: 0.95, opacity: 0 }}
              className="bg-white rounded-2xl shadow-xl w-full max-w-2xl overflow-hidden border border-slate-100 flex flex-col max-h-[90vh]"
            >
              
              {/* Modal header */}
              <div className="bg-slate-900 text-white px-6 py-4 flex items-center justify-between">
                <div>
                  <span className="text-[10px] text-yellow-400 font-bold uppercase tracking-widest">Score Ledger Editor</span>
                  <p className="font-bold text-base truncate mt-0.5">{selectedLearner.name}</p>
                </div>
                <button
                  id="btn-close-modal"
                  onClick={() => setSelectedLearner(null)}
                  className="p-1 text-slate-400 hover:text-white transition-colors cursor-pointer"
                >
                  ✕
                </button>
              </div>

              {/* Modal content list */}
              <div id="modal-input-ledger-fields" className="p-6 overflow-y-auto space-y-4 flex-1">
                <div className="grid grid-cols-2 text-[10px] font-bold text-slate-400 uppercase tracking-wider pb-2 border-b border-slate-100">
                  <span>Subject Field Name</span>
                  <div className="grid grid-cols-2 gap-4">
                    <span>CA Raw (MAX 100)</span>
                    <span>Exam Raw (MAX 100)</span>
                  </div>
                </div>

                <div className="space-y-4">
                  {SUBJECTS.map((sub) => {
                    const caVal = editScores[sub.id]?.ca ?? '';
                    const examVal = editScores[sub.id]?.exam ?? '';
                    
                    return (
                      <div key={sub.id} className="grid grid-cols-2 items-center gap-4 text-xs font-medium text-slate-700">
                        <span className="truncate">{sub.name}</span>
                        <div className="grid grid-cols-2 gap-4">
                          <input
                            type="number"
                            min="0"
                            max="100"
                            placeholder="Absent"
                            value={caVal}
                            onChange={(e) => {
                              const val = e.target.value === '' ? null : Math.min(100, Math.max(0, parseInt(e.target.value) || 0));
                              setEditScores({
                                ...editScores,
                                [sub.id]: { ...editScores[sub.id], ca: val }
                              });
                            }}
                            className="px-3 py-1.5 bg-slate-50 border border-slate-200 rounded-lg text-center font-mono focus:bg-white focus:outline-none focus:border-emerald-500"
                          />
                          <input
                            type="number"
                            min="0"
                            max="100"
                            placeholder="Empty"
                            value={examVal}
                            onChange={(e) => {
                              const val = e.target.value === '' ? null : Math.min(100, Math.max(0, parseInt(e.target.value) || 0));
                              setEditScores({
                                ...editScores,
                                [sub.id]: { ...editScores[sub.id], exam: val }
                              });
                            }}
                            className="px-3 py-1.5 bg-slate-50 border border-slate-200 rounded-lg text-center font-mono focus:bg-white focus:outline-none focus:border-emerald-500"
                          />
                        </div>
                      </div>
                    );
                  })}
                </div>
              </div>

              {/* Modal footer controls */}
              <div className="bg-slate-50 px-6 py-4 flex items-center justify-end gap-3 border-t border-slate-100">
                <button
                  id="btn-modal-cancel"
                  onClick={() => setSelectedLearner(null)}
                  className="px-4 py-2 border border-slate-200 hover:bg-slate-100 hover:border-slate-300 rounded-xl transition-all font-bold text-xs text-slate-500 cursor-pointer"
                >
                  Cancel
                </button>
                <button
                  id="btn-modal-submit"
                  onClick={handleSaveEditor}
                  className="px-5 py-2 bg-emerald-600 hover:bg-emerald-500 text-white font-bold text-xs rounded-xl transition-all cursor-pointer shadow-sm active:scale-95"
                >
                  Save Assessment Records
                </button>
              </div>

            </motion.div>
          </div>
        )}
      </AnimatePresence>
    </div>
  );
}

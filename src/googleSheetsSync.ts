import { Learner, AssessmentMetadata } from './types';
import { SUBJECTS } from './data';

// Keep state references safe
let app: any = null;
let auth: any = null;
let GoogleAuthProviderRef: any = null;
let signInWithPopupRef: any = null;

export async function tryInitFirebase() {
  try {
    // Dynamically check and fetch if config exists
    const configPath = '/firebase-applet-config.json';
    const response = await fetch(configPath);
    if (!response.ok) {
      throw new Error('Config file not ready');
    }
    const textBlob = await response.text();
    if (!textBlob.trim().startsWith('{')) {
      throw new Error('Not a valid JSON config (got fallback or HTML)');
    }
    const firebaseConfig = JSON.parse(textBlob);
    if (!firebaseConfig || !firebaseConfig.apiKey || firebaseConfig.apiKey === '...') {
      throw new Error('Config content is placeholder');
    }
    
    // Import firebase dynamically to avoid crashing on page load in browser if sandbox doesn't permit certain static setups
    const { initializeApp: dynInitializeApp, getApp: dynGetApp, getApps: dynGetApps } = await import('firebase/app');
    const { getAuth: dynGetAuth, GoogleAuthProvider: dynGoogleAuthProvider, signInWithPopup: dynSignInWithPopup } = await import('firebase/auth');

    if (dynGetApps().length > 0) {
      app = dynGetApp();
    } else {
      app = dynInitializeApp(firebaseConfig);
    }
    auth = dynGetAuth(app);
    GoogleAuthProviderRef = dynGoogleAuthProvider;
    signInWithPopupRef = dynSignInWithPopup;
    return true;
  } catch (err) {
    console.warn('Firebase setup is pending OAuth activation. Offline mode enabled.', err);
    return false;
  }
}

// In-memory token cache
let cachedAccessToken: string | null = null;
let currentUser: any = null;

export function getCachedToken() {
  return cachedAccessToken;
}

export function getCurrentUser() {
  return currentUser;
}

export async function loginWithGoogle(): Promise<{ user: any; token: string } | null> {
  if (!auth) {
    const isInit = await tryInitFirebase();
    if (!isInit || !GoogleAuthProviderRef || !signInWithPopupRef) {
      throw new Error('Google Integration is currently in local offline mode. Please configure OAuth first.');
    }
  }

  try {
    const provider = new GoogleAuthProviderRef();
    provider.addScope('https://www.googleapis.com/auth/spreadsheets');
    provider.addScope('https://www.googleapis.com/auth/drive.file');

    const result = await signInWithPopupRef(auth, provider);
    const credential = GoogleAuthProviderRef.credentialFromResult(result);
    if (!credential?.accessToken) {
      throw new Error('Access token wasn\'t issued by Google.');
    }

    cachedAccessToken = credential.accessToken;
    currentUser = result.user;
    return { user: result.user, token: cachedAccessToken };
  } catch (error: any) {
    console.error('Sign in with Google failed:', error);
    throw error;
  }
}

export function logout() {
  if (auth) {
    auth.signOut();
  }
  cachedAccessToken = null;
  currentUser = null;
}

// Prepare values grid for a class tab to put into Google Sheets
export function prepareGrid(meta: AssessmentMetadata, learners: Learner[], className: string) {
  const grid: any[][] = [];

  // Title elements
  grid.push([`${meta.schoolName.toUpperCase()} - MID-TERM EXAM ASSESSMENT`]);
  grid.push(['GHANA EDUCATION SERVICE (GES) BASIC SCHOOL OFFICIAL RECORDS']);
  grid.push([`${className.toUpperCase()} ASSESSMENT MATRIX - ${meta.academicYear} (${meta.term})`]);
  grid.push([]); // spacer

  // Metadata block
  grid.push(['School Name:', meta.schoolName, '', 'EMIS Code:', meta.emisCode]);
  grid.push(['Circuit Name:', meta.circuit, '', 'District:', meta.district]);
  grid.push(['Academic Year:', meta.academicYear, '', 'Term:', meta.term]);
  grid.push([]); // spacer

  // Table Headers
  // Header Row 1: Roll No, Name, Subject titles (merged layout in spirit)
  const headerRow1 = ['Roll No', 'Learner Name'];
  const headerRow2 = ['', ''];
  const headerRow3 = ['', ''];

  SUBJECTS.forEach((sub) => {
    headerRow1.push(sub.name, '', '', '', '');
    headerRow2.push('CA Raw (100%)', 'CA 50%', 'Exam Raw (100%)', 'Exam 50%', 'Total (100%)');
    headerRow3.push('(100%)', '(50%)', '(100%)', '(50%)', '(100%)');
  });

  headerRow1.push('Overall Total', 'Average Score', 'Grade', 'Position');
  headerRow2.push('', '', '', '');
  headerRow3.push('', '', '', '');

  grid.push(headerRow1);
  grid.push(headerRow2);
  grid.push(headerRow3);

  // Student Rows
  const startRowIndex = grid.length + 1; // Google sheets rows are 1-indexed

  learners.forEach((learner, index) => {
    const rIdx = startRowIndex + index;
    const rowData: any[] = [index + 1, learner.name];

    SUBJECTS.forEach((sub, subIdx) => {
      const score = learner.scores[sub.id];
      const caVal = score?.caScore !== null ? Number(score.caScore) : '';
      const examVal = score?.examScore !== null ? Number(score.examScore) : '';
      
      rowData.push(caVal);
      
      // We write actual sheet formulas so Google Sheets computes them live!
      const caCol = getColLetter(2 + subIdx * 5);
      rowData.push(`=${caCol}${rIdx}/2`);
      
      rowData.push(examVal);
      
      const examCol = getColLetter(2 + subIdx * 5 + 2);
      rowData.push(`=${examCol}${rIdx}/2`);

      const caConvCol = getColLetter(2 + subIdx * 5 + 1);
      const examConvCol = getColLetter(2 + subIdx * 5 + 3);
      rowData.push(`=${caConvCol}${rIdx}+${examConvCol}${rIdx}`);
    });

    // Calculations columns formulas
    const totalFormulaParts: string[] = [];
    SUBJECTS.forEach((sub, subIdx) => {
      const colLetter = getColLetter(2 + subIdx * 5 + 4);
      totalFormulaParts.push(`${colLetter}${rIdx}`);
    });
    rowData.push(`=SUM(${totalFormulaParts.join(',')})`);

    const overallTotalCol = getColLetter(2 + SUBJECTS.length * 5);
    rowData.push(`=ROUND(${overallTotalCol}${rIdx}/${SUBJECTS.length}, 1)`);

    const averageCol = getColLetter(2 + SUBJECTS.length * 5 + 1);
    rowData.push(`=IF(${averageCol}${rIdx}>=80,"A",IF(${averageCol}${rIdx}>=70,"B+",IF(${averageCol}${rIdx}>=60,"B",IF(${averageCol}${rIdx}>=50,"C",IF(${averageCol}${rIdx}>=40,"D","F")))))`);

    // Position formula: compare average of the student to average range of all students
    const endRowIdx = startRowIndex + learners.length - 1;
    rowData.push(`=RANK.EQ(${averageCol}${rIdx}, ${averageCol}${startRowIndex}:${averageCol}${endRowIdx})`);

    grid.push(rowData);
  });

  grid.push([]); // spacer
  const dataEndRow = grid.length;

  // Class Summary cards
  grid.push(['CLASS SUMMARY']);
  const avgColLetter = getColLetter(2 + SUBJECTS.length * 5 + 1);
  const dataRange = `${avgColLetter}${startRowIndex}:${avgColLetter}${dataEndRow}`;

  grid.push(['Highest Average:', `=MAX(${dataRange})`]);
  grid.push(['Lowest Average:', `=MIN(${dataRange})`]);
  grid.push(['Class Average:', `=ROUND(AVERAGE(${dataRange}), 1)`]);
  grid.push(['Number Passed (Avg >= 40):', `=COUNTIF(${dataRange}, ">=40")`]);
  grid.push(['Number Failed (Avg < 40):', `=COUNTIF(${dataRange}, "<40")`]);

  grid.push([]); // spacer

  const teacherName = className === 'Class 4' ? meta.teacherNameClass4 : meta.teacherNameClass5;
  grid.push(['Class Teacher Name:', teacherName, '', 'Headteacher Signature:']);
  grid.push(['Teacher Signature:', '__________________________________', '', 'Date Signed:', new Date().toLocaleDateString('en-GB')]);

  return grid;
}

// Simple alphabet mapping for column indices
function getColLetter(colIdx: number): string {
  let letter = '';
  let temp = colIdx;
  while (temp >= 0) {
    letter = String.fromCharCode((temp % 26) + 65) + letter;
    temp = Math.floor(temp / 26) - 1;
  }
  return letter;
}

// Push to Google Sheets API
export async function syncToGoogleSheets(
  meta: AssessmentMetadata,
  class4Learners: Learner[],
  class5Learners: Learner[]
): Promise<string> {
  if (!cachedAccessToken) {
    throw new Error('Not signed into Google Services. Keep offline.');
  }

  // 1. Create a beautiful blank Spreadsheet in Google Drive
  const createResponse = await fetch('https://sheets.googleapis.com/v4/spreadsheets', {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${cachedAccessToken}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      properties: {
        title: `${meta.schoolName} - Official GES Assessment (${meta.academicYear})`,
      },
      sheets: [
        { properties: { title: 'Class 4' } },
        { properties: { title: 'Class 5' } },
      ],
    }),
  });

  if (!createResponse.ok) {
    const errorData = await createResponse.json();
    throw new Error(errorData.error?.message || 'Failed to create Google Spreadsheet.');
  }

  const sheetData = await createResponse.json();
  const spreadsheetId = sheetData.spreadsheetId;
  const spreadsheetUrl = sheetData.spreadsheetUrl;

  // 2. Prepare Class 4 Grid and write values
  const class4Grid = prepareGrid(meta, class4Learners, 'Class 4');
  const class5Grid = prepareGrid(meta, class5Learners, 'Class 5');

  // Write Class 4 data
  const write4Response = await fetch(
    `https://sheets.googleapis.com/v4/spreadsheets/${spreadsheetId}/values/Class%204!A1?valueInputOption=USER_ENTERED`,
    {
      method: 'PUT',
      headers: {
        'Authorization': `Bearer ${cachedAccessToken}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        values: class4Grid,
      }),
    }
  );

  // Write Class 5 data
  const write5Response = await fetch(
    `https://sheets.googleapis.com/v4/spreadsheets/${spreadsheetId}/values/Class%205!A1?valueInputOption=USER_ENTERED`,
    {
      method: 'PUT',
      headers: {
        'Authorization': `Bearer ${cachedAccessToken}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        values: class5Grid,
      }),
    }
  );

  if (!write4Response.ok || !write5Response.ok) {
    throw new Error('Spreadsheet created, but failed to write student ledger metrics.');
  }

  return spreadsheetUrl || `https://docs.google.com/spreadsheets/d/${spreadsheetId}`;
}

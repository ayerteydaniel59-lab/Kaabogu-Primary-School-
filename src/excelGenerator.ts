import * as XLSX from 'xlsx';
import { Learner, AssessmentMetadata } from './types';
import { SUBJECTS } from './data';

function getColLetter(colIndex: number): string {
  let letter = '';
  let temp = colIndex;
  while (temp >= 0) {
    letter = String.fromCharCode((temp % 26) + 65) + letter;
    temp = Math.floor(temp / 26) - 1;
  }
  return letter;
}

export function generateExcelFile(
  metadata: AssessmentMetadata,
  class4Learners: Learner[],
  class5Learners: Learner[]
): Blob {
  // Create workbook
  const wb = XLSX.utils.book_new();

  // Draw sheets for Class 4 and Class 5
  createClassSheet(wb, 'Class 4', metadata, class4Learners, metadata.teacherNameClass4);
  createClassSheet(wb, 'Class 5', metadata, class5Learners, metadata.teacherNameClass5);

  // Write a buffer and convert to Blob
  const excelBuffer = XLSX.write(wb, { bookType: 'xlsx', type: 'array' });
  return new Blob([excelBuffer], { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' });
}

function createClassSheet(
  wb: XLSX.WorkBook,
  sheetName: string,
  meta: AssessmentMetadata,
  learners: Learner[],
  teacherName: string
) {
  const ws: XLSX.WorkSheet = {};
  const merges: XLSX.Range[] = [];

  // Grid / rows index trackers
  let r = 0;

  // Set cell utility
  const setCell = (row: number, col: number, value: any, type: 's' | 'n' | 'f' = 's') => {
    const cellRef = getColLetter(col) + (row + 1);
    if (type === 'f') {
      ws[cellRef] = { t: 'n', f: value };
    } else if (type === 'n') {
      ws[cellRef] = { t: 'n', v: value === null ? '' : Number(value) };
    } else {
      ws[cellRef] = { t: 's', v: String(value || '') };
    }
  };

  // 1. Header Section - Title Block (Ghana Education Service theme)
  setCell(r, 0, meta.schoolName.toUpperCase() + ' - MID-TERM EXAM ASSESSMENT');
  merges.push({ s: { r: r, c: 0 }, e: { r: r, c: 10 } });
  r++;

  setCell(r, 0, 'GHANA EDUCATION SERVICE (GES) BASIC SCHOOL OFFICIAL RECORDS');
  merges.push({ s: { r: r, c: 0 }, e: { r: r, c: 10 } });
  r++;

  setCell(r, 0, `${sheetName.toUpperCase()} ASSESSMENT MATRIX - ${meta.academicYear} (${meta.term})`);
  merges.push({ s: { r: r, c: 0 }, e: { r: r, c: 10 } });
  r++;
  r++; // empty spacing row

  // 2. School Metadata Meta-Fields Block
  const metaRows = [
    { label1: 'School Name:', val1: meta.schoolName, label2: 'EMIS Code:', val2: meta.emisCode },
    { label1: 'Circuit Name:', val1: meta.circuit, label2: 'District:', val2: meta.district },
    { label1: 'Academic Year:', val1: meta.academicYear, label2: 'Term:', val2: meta.term },
  ];

  metaRows.forEach((mRow) => {
    setCell(r, 0, mRow.label1);
    setCell(r, 1, mRow.val1);
    setCell(r, 3, mRow.label2);
    setCell(r, 4, mRow.val2);
    r++;
  });
  r++; // spacing row

  // 3. Setup Tables Headers
  // We need column mapping
  // Header Row 1: Merged title blocks
  // Header Row 2: Column labels (e.g., CA Score, CA Converted)
  // Header Row 3: Percentages indicators (e.g., 100%, 50%)
  
  const headerStartRow = r;
  const colA_RollNo = 0;
  const colB_Name = 1;

  setCell(r, colA_RollNo, 'Roll No');
  setCell(r + 1, colA_RollNo, '');
  setCell(r + 2, colA_RollNo, '');
  merges.push({ s: { r: r, c: colA_RollNo }, e: { r: r + 2, c: colA_RollNo } });

  setCell(r, colB_Name, 'Learner Name');
  setCell(r + 1, colB_Name, '');
  setCell(r + 2, colB_Name, '');
  merges.push({ s: { r: r, c: colB_Name }, e: { r: r + 2, c: colB_Name } });

  let colIdx = 2;
  const subjectColOffsets: Record<string, number> = {};

  // For each subject, set up headers
  SUBJECTS.forEach((sub) => {
    subjectColOffsets[sub.id] = colIdx;

    // Row header 1: Subject full name merged across 5 columns
    setCell(r, colIdx, sub.name);
    for (let offset = 1; offset < 5; offset++) {
      setCell(r, colIdx + offset, '');
    }
    merges.push({ s: { r: r, c: colIdx }, e: { r: r, c: colIdx + 4 } });

    // Row header 2: Columns descriptors
    setCell(r + 1, colIdx, 'CA Raw');
    setCell(r + 1, colIdx + 1, 'CA 50%');
    setCell(r + 1, colIdx + 2, 'Exam Raw');
    setCell(r + 1, colIdx + 3, 'Exam 50%');
    setCell(r + 1, colIdx + 4, 'Total 100%');

    // Row header 3: Percentages or weights
    setCell(r + 2, colIdx, '(100%)');
    setCell(r + 2, colIdx + 1, '(50%)');
    setCell(r + 2, colIdx + 2, '(100%)');
    setCell(r + 2, colIdx + 3, '(50%)');
    setCell(r + 2, colIdx + 4, '(100%)');

    colIdx += 5;
  });

  // Score summary columns
  const colOverallTotal = colIdx;
  const colAverage = colIdx + 1;
  const colGrade = colIdx + 2;
  const colPosition = colIdx + 3;

  setCell(r, colOverallTotal, 'Overall Total');
  setCell(r + 1, colOverallTotal, '');
  setCell(r + 2, colOverallTotal, '');
  merges.push({ s: { r: r, c: colOverallTotal }, e: { r: r + 2, c: colOverallTotal } });

  setCell(r, colAverage, 'Average Score');
  setCell(r + 1, colAverage, '');
  setCell(r + 2, colAverage, '');
  merges.push({ s: { r: r, c: colAverage }, e: { r: r + 2, c: colAverage } });

  setCell(r, colGrade, 'Grade');
  setCell(r + 1, colGrade, '');
  setCell(r + 2, colGrade, '');
  merges.push({ s: { r: r, c: colGrade }, e: { r: r + 2, c: colGrade } });

  setCell(r, colPosition, 'Position');
  setCell(r + 1, colPosition, '');
  setCell(r + 2, colPosition, '');
  merges.push({ s: { r: r, c: colPosition }, e: { r: r + 2, c: colPosition } });

  r += 3; // headers complete!

  // 4. Populate Student Data with dynamic Excel formulas
  const dataStartRow = r;
  
  learners.forEach((learner, index) => {
    const rollNo = index + 1;
    const xlsxRowIdx = r + 1; // 1-based index in Excel formula strings
    
    setCell(r, colA_RollNo, rollNo, 'n');
    setCell(r, colB_Name, learner.name);

    // Subject cells
    SUBJECTS.forEach((sub) => {
      const offset = subjectColOffsets[sub.id];
      const subScore = learner.scores[sub.id];

      const rawCA = subScore ? subScore.caScore : null;
      const rawExam = subScore ? subScore.examScore : null;

      // Col Raw CA Score
      setCell(r, offset, rawCA, 'n');
      
      // Col CA Converted (50%): CA / 2
      const caLetter = getColLetter(offset);
      setCell(r, offset + 1, `${caLetter}${xlsxRowIdx}/2`, 'f');

      // Col Raw Exam Score
      setCell(r, offset + 2, rawExam, 'n');

      // Col Exam Converted (50%): Exam / 2
      const examLetter = getColLetter(offset + 2);
      setCell(r, offset + 3, `${examLetter}${xlsxRowIdx}/2`, 'f');

      // Col Subject Total (100%): CA Converted + Exam Converted
      const caConvLetter = getColLetter(offset + 1);
      const examConvLetter = getColLetter(offset + 3);
      setCell(r, offset + 4, `${caConvLetter}${xlsxRowIdx}+${examConvLetter}${xlsxRowIdx}`, 'f');
    });

    // Calculations & Statistics
    // Overall Total Formula: sum of all subject total columns
    const totalFormulaParts: string[] = [];
    SUBJECTS.forEach((sub) => {
      const offset = subjectColOffsets[sub.id];
      const subTotalLetter = getColLetter(offset + 4);
      totalFormulaParts.push(`${subTotalLetter}${xlsxRowIdx}`);
    });
    setCell(r, colOverallTotal, `SUM(${totalFormulaParts.join(',')})`, 'f');

    // Average Score Formula: overall total divided by active/filled subjects or constant
    const overallTotalLetter = getColLetter(colOverallTotal);
    setCell(r, colAverage, `ROUND(${overallTotalLetter}${xlsxRowIdx}/${SUBJECTS.length}, 1)`, 'f');

    // GES Standard Grading scale formula
    const avgScoreLetter = getColLetter(colAverage);
    const gradingFormula = `IF(${avgScoreLetter}${xlsxRowIdx}>=80,"A",IF(${avgScoreLetter}${xlsxRowIdx}>=70,"B+",IF(${avgScoreLetter}${xlsxRowIdx}>=60,"B",IF(${avgScoreLetter}${xlsxRowIdx}>=50,"C",IF(${avgScoreLetter}${xlsxRowIdx}>=40,"D","F")))))`;
    setCell(r, colGrade, gradingFormula, 'f');

    // Position Ranking Formula
    // We'll write a Excel RANK formula compared across all student rows
    const dataEndRowIdx = dataStartRow + learners.length;
    setCell(r, colPosition, `RANK.EQ(${avgScoreLetter}${xlsxRowIdx}, ${avgScoreLetter}${dataStartRow + 1}:${avgScoreLetter}${dataEndRowIdx})`, 'f');

    r++;
  });

  const dataEndRow = r;
  r += 2; // spacer

  // 5. Class Summary Section
  setCell(r, 0, 'CLASS SUMMARY');
  merges.push({ s: { r: r, c: 0 }, e: { r: r, c: 2 } });
  r++;

  const avgColLetter = getColLetter(colAverage);
  const dataRange = `${avgColLetter}${dataStartRow + 1}:${avgColLetter}${dataEndRow}`;

  setCell(r, 0, 'Highest Average:');
  setCell(r, 2, `MAX(${dataRange})`, 'f');
  r++;

  setCell(r, 0, 'Lowest Average:');
  setCell(r, 2, `MIN(${dataRange})`, 'f');
  r++;

  setCell(r, 0, 'Class Average:');
  setCell(r, 2, `ROUND(AVERAGE(${dataRange}), 1)`, 'f');
  r++;

  setCell(r, 0, 'Number Passed (Avg >= 40):');
  setCell(r, 2, `COUNTIF(${dataRange}, ">=40")`, 'f');
  r++;

  setCell(r, 0, 'Number Failed (Avg < 40):');
  setCell(r, 2, `COUNTIF(${dataRange}, "<40")`, 'f');
  r++;
  r += 2; // spacer

  // 6. Signature Fields
  setCell(r, 0, 'Class Teacher Name:');
  setCell(r, 1, teacherName);
  setCell(r, 5, 'Headteacher Signature:');
  setCell(r, 7, '__________________________________');
  r++;

  setCell(r, 0, 'Teacher Signature:');
  setCell(r, 1, '__________________________________');
  setCell(r, 5, 'Date Signed:');
  setCell(r, 7, new Date().toLocaleDateString('en-GB'));

  // Define properties for sheet columns widths
  const colsConfig = [
    { wch: 8 },  // Roll No
    { wch: 26 }, // Name
  ];
  // Config subject column sizes
  for (let s = 0; s < SUBJECTS.length * 5; s++) {
    colsConfig.push({ wch: 10 });
  }
  colsConfig.push({ wch: 15 }); // Total
  colsConfig.push({ wch: 15 }); // Avg
  colsConfig.push({ wch: 10 }); // Grade
  colsConfig.push({ wch: 10 }); // Position

  ws['!cols'] = colsConfig;
  ws['!merges'] = merges;

  // Add sheet to book
  XLSX.utils.book_append_sheet(wb, ws, sheetName);
}

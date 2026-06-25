import { ClassData, AssessmentMetadata } from './types';

export const INITIAL_METADATA: AssessmentMetadata = {
  schoolName: 'Kaabogu Basic School',
  emisCode: '091204001',
  circuit: 'Kaabogu Circuit',
  district: 'Wa West District',
  academicYear: '2025/2026',
  term: 'Term 3',
  teacherNameClass4: 'Mr. David Salifu',
  teacherNameClass5: 'Mrs. Janet Gyamfi',
};

export const SUBJECTS = [
  { id: 'maths', name: 'Mathematics', short: 'Maths' },
  { id: 'science', name: 'Science', short: 'Sci' },
  { id: 'dagaare', name: 'Dagaare', short: 'Dag' },
  { id: 'rme', name: 'Religious & Moral Education', short: 'RME' },
  { id: 'english', name: 'English Language', short: 'Eng' },
  { id: 'computing', name: 'Computing', short: 'Comp' },
  { id: 'creative_arts', name: 'Creative Arts', short: 'Arts' },
];

export const INITIAL_CLASS_4_LEARNERS = [
  {
    id: 'c4_1',
    name: 'Donyaga Macellinus',
    scores: {
      maths: null,
      science: 70,
      dagaare: null,
      rme: null,
      english: null,
      computing: null,
      creative_arts: null,
    }
  },
  {
    id: 'c4_2',
    name: 'Kanda, Nun-Era Madat',
    scores: {
      maths: 30,
      science: null,
      dagaare: null,
      rme: null,
      english: 10,
      computing: null,
      creative_arts: 40,
    }
  },
  {
    id: 'c4_3',
    name: 'Taduri Caesarius',
    scores: {
      maths: 50,
      science: 50,
      dagaare: 90,
      rme: 90,
      english: null,
      computing: 100,
      creative_arts: 60,
    }
  },
  {
    id: 'c4_4',
    name: 'Banyera Ignasia',
    scores: {
      maths: null,
      science: null,
      dagaare: 30,
      rme: null,
      english: null,
      computing: null,
      creative_arts: null,
    }
  },
  {
    id: 'c4_5',
    name: 'Doryen Kaa-Ebu Ancilla',
    scores: {
      maths: 20,
      science: 30,
      dagaare: 90,
      rme: 90,
      english: 70,
      computing: 80,
      creative_arts: 70,
    }
  },
  {
    id: 'c4_6',
    name: 'Era Vera',
    scores: {
      maths: 80,
      science: 50,
      dagaare: 70,
      rme: 80,
      english: 90,
      computing: 90,
      creative_arts: 80,
    }
  },
  {
    id: 'c4_7',
    name: 'Eaanobayen Ethela',
    scores: {
      maths: 70,
      science: 40,
      dagaare: 70,
      rme: null,
      english: 80,
      computing: 90,
      creative_arts: null,
    }
  },
  {
    id: 'c4_8',
    name: 'Era Shelly',
    scores: {
      maths: null,
      science: null,
      dagaare: 80,
      rme: null,
      english: null,
      computing: null,
      creative_arts: 60,
    }
  },
  {
    id: 'c4_9',
    name: 'Kyebal Nancy',
    scores: {
      maths: 30,
      science: 40,
      dagaare: 30,
      rme: null,
      english: 60,
      computing: null,
      creative_arts: null,
    }
  },
  {
    id: 'c4_10',
    name: 'Naayirido Elizabeth',
    scores: {
      maths: null,
      science: 40,
      dagaare: null,
      rme: 60,
      english: 50,
      computing: 80,
      creative_arts: 60,
    }
  },
  {
    id: 'c4_11',
    name: 'Sanche Diana',
    scores: {
      maths: 50,
      science: 40,
      dagaare: 50,
      rme: 60,
      english: null,
      computing: null,
      creative_arts: 60,
    }
  },
  {
    id: 'c4_12',
    name: 'Sumabe Mary-Magdaline',
    scores: {
      maths: 50,
      science: 50,
      dagaare: 80,
      rme: 60,
      english: 50,
      computing: 90,
      creative_arts: null,
    }
  },
  {
    id: 'c4_13',
    name: 'Comfort Kpenepire',
    scores: {
      maths: null,
      science: null,
      dagaare: 50,
      rme: 80,
      english: null,
      computing: null,
      creative_arts: null,
    }
  }
];

export const INITIAL_CLASS_5_LEARNERS = [
  {
    id: 'c5_1',
    name: 'Banyera Anthony',
    scores: {
      maths: 70,
      science: 50,
      dagaare: 80,
      rme: 60,
      english: 80,
      computing: 100,
      creative_arts: 70,
    }
  },
  {
    id: 'c5_2',
    name: 'Banyera Cliford',
    scores: {
      maths: 80,
      science: 60,
      dagaare: 70,
      rme: 50,
      english: 90,
      computing: 70,
      creative_arts: 80,
    }
  },
  {
    id: 'c5_3',
    name: 'Dogee Kingsford',
    scores: {
      maths: 70,
      science: 50,
      dagaare: 50,
      rme: null,
      english: null,
      computing: null,
      creative_arts: null,
    }
  },
  {
    id: 'c5_4',
    name: 'Dakuraa B. Joana',
    scores: {
      maths: 40,
      science: null,
      dagaare: 70,
      rme: 70,
      english: 70,
      computing: null,
      creative_arts: null,
    }
  },
  {
    id: 'c5_5',
    name: 'Dogee Emmanualla',
    scores: {
      maths: null,
      science: 30,
      dagaare: 60,
      rme: null,
      english: 90,
      computing: 100,
      creative_arts: 50,
    }
  }
];

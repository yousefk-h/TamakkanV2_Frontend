export type Report = {
  student: string;
  initials: string;
  topic: string;
  date: string;
  duration: string;
  overall: number;
  skills: [string, number][];
  summary: string;
  status: string;
};

export const reports: Report[] = [
  { student: "Noor Ahmad", initials: "NA", topic: "Talking about Music", date: "Aug 4, 2026", duration: "11 min", overall: 68, skills: [["Pronunciation", 64], ["Fluency", 66], ["Grammar", 70], ["Confidence", 60]], summary: "Noor understood the topic but hesitated frequently and relied on short answers. Recommend more free-talk practice to build confidence.", status: "Needs review" },
  { student: "Alex Morgan", initials: "AM", topic: "Talking About Your Daily Routine", date: "Aug 4, 2026", duration: "9 min", overall: 79, skills: [["Pronunciation", 82], ["Fluency", 78], ["Grammar", 74], ["Confidence", 72]], summary: "Alex used target vocabulary naturally and gave clear reasons for opinions. Minor grammar slips with conditional tenses.", status: "Reviewed" },
  { student: "Yazan Ali", initials: "YA", topic: "Is Travelling the Best Way to Learn About Cultures?", date: "Aug 3, 2026", duration: "10 min", overall: 76, skills: [["Pronunciation", 75], ["Fluency", 77], ["Grammar", 74], ["Confidence", 78]], summary: "Good use of example-based reasoning. Could improve on linking words between sentences.", status: "Reviewed" },
  { student: "Lina Haddad", initials: "LH", topic: "Talking about Music", date: "Aug 2, 2026", duration: "13 min", overall: 84, skills: [["Pronunciation", 85], ["Fluency", 83], ["Grammar", 81], ["Confidence", 86]], summary: "Strong, natural delivery with excellent use of polite disagreement phrases.", status: "Reviewed" },
  { student: "Tariq Suleiman", initials: "TS", topic: "Greetings & introductions", date: "Aug 1, 2026", duration: "7 min", overall: 61, skills: [["Pronunciation", 58], ["Fluency", 60], ["Grammar", 63], ["Confidence", 57]], summary: "Tariq is still building basic sentence structure. Suggest pairing with more Beginner speaking drills before the next video.", status: "Needs review" },
  { student: "Omar Saleh", initials: "OS", topic: "Negotiation language", date: "Jul 31, 2026", duration: "12 min", overall: 91, skills: [["Pronunciation", 90], ["Fluency", 92], ["Grammar", 88], ["Confidence", 93]], summary: "Excellent command of negotiation vocabulary and confident delivery throughout.", status: "Reviewed" },
];

export const scoreByLevel: [string, number][] = [
  ["Beginner", 71],
  ["Intermediate", 81],
  ["Advanced", 88],
];

export const retentionByWeek: [string, number][] = [
  ["Week 1", 100],
  ["Week 2", 88],
  ["Week 3", 76],
  ["Week 4", 69],
];

export const analyticsStatsByRange: Record<string, [string, string, string][]> = {
  "7D": [["Weekly active students", "142", "+6%"], ["Avg. session length", "8.7 min", "+0.6 min"], ["Live class attendance", "79%", "+2%"], ["Avg. report turnaround", "5.1 hrs", "-10 min"]],
  "30D": [["Weekly active students", "189", "+9%"], ["Avg. session length", "9.4 min", "+1.2 min"], ["Live class attendance", "82%", "+3%"], ["Avg. report turnaround", "4.2 hrs", "-30 min"]],
};

import type { IconName } from "@/components/ui/Icon";

export const activityFeed: { time: string; text: string; type: "success" | "warn" | "info" }[] = [
  { time: "2 min ago", text: "Alex Morgan completed Day 12 of the challenge.", type: "success" },
  { time: "14 min ago", text: "Noor Ahmad's AI report was flagged for review.", type: "warn" },
  { time: "38 min ago", text: "Karim Zaid scored 94/100 on Negotiation language.", type: "success" },
  { time: "1 hr ago", text: "Debate: Social Media Impact class starts in 4 hours, 12 enrolled.", type: "info" },
  { time: "2 hrs ago", text: "Tariq Suleiman missed his 3rd session this week.", type: "warn" },
  { time: "3 hrs ago", text: "Lina Haddad joined a 1:1 coaching session with Mr. Daniel.", type: "info" },
];

export const metricsByRange: Record<string, [string, string, string, IconName][]> = {
  Today: [["Active students", "34", "+4", "people"], ["Challenge completion", "81%", "+2%", "challenge"], ["Avg. speaking score", "80", "+1 pt", "practice"], ["Needs review", "3", "AI reports", "report"]],
  "7D": [["Active students", "142", "+18", "people"], ["Challenge completion", "78%", "+5%", "challenge"], ["Avg. speaking score", "81", "+3 pts", "practice"], ["Needs review", "8", "AI reports", "report"]],
  "30D": [["Active students", "248", "+12%", "people"], ["Challenge completion", "76%", "+8%", "challenge"], ["Avg. speaking score", "81", "+5 pts", "practice"], ["Needs review", "12", "AI reports", "report"]],
};

export const sparklines: Record<string, number[]> = {
  people: [30, 34, 32, 40, 44, 41, 48, 52],
  challenge: [60, 64, 62, 68, 70, 74, 72, 76],
  practice: [74, 75, 76, 75, 78, 79, 80, 81],
  report: [5, 7, 6, 9, 8, 11, 10, 12],
};

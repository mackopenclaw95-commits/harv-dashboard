import { supabase } from "./supabase";

export interface LearningTrack {
  id: string;
  topic: string;
  description: string | null;
  level: string;
  goal: string | null;
  outline: { sections?: { title: string; topics: string[]; done?: boolean }[] } | null;
  status: "active" | "paused" | "completed";
  progress_pct: number;
  hours_logged: number;
  target_date: string | null;
  created_at: string;
  updated_at: string;
  last_studied_at: string | null;
}

export interface LearningMaterial {
  id: string;
  track_id: string | null;
  type: "guide" | "flashcards" | "quiz" | "resources" | "summary" | "outline";
  title: string | null;
  content: string | null;
  metadata: unknown;
  created_at: string;
}

export interface LearningSession {
  id: string;
  track_id: string | null;
  hours: number;
  notes: string | null;
  logged_at: string;
}

export async function listTracks(status?: "active" | "paused" | "completed"): Promise<LearningTrack[]> {
  let q = supabase.from("learning_tracks").select("*").order("updated_at", { ascending: false });
  if (status) q = q.eq("status", status);
  const { data, error } = await q;
  if (error) {
    console.error("listTracks", error);
    return [];
  }
  return (data as LearningTrack[]) || [];
}

export async function listMaterials(trackId: string, type?: LearningMaterial["type"]): Promise<LearningMaterial[]> {
  let q = supabase
    .from("learning_materials")
    .select("*")
    .eq("track_id", trackId)
    .order("created_at", { ascending: false });
  if (type) q = q.eq("type", type);
  const { data, error } = await q;
  if (error) {
    console.error("listMaterials", error);
    return [];
  }
  return (data as LearningMaterial[]) || [];
}

export async function listRecentSessions(limit = 10): Promise<(LearningSession & { track_topic?: string })[]> {
  const { data, error } = await supabase
    .from("learning_sessions")
    .select("*, learning_tracks(topic)")
    .order("logged_at", { ascending: false })
    .limit(limit);
  if (error) {
    console.error("listRecentSessions", error);
    return [];
  }
  return (data || []).map((row) => ({
    ...(row as LearningSession),
    track_topic: (row as { learning_tracks?: { topic?: string } }).learning_tracks?.topic,
  }));
}

export async function getLearningStats(): Promise<{
  totalHours: number;
  activeTracks: number;
  completedTracks: number;
  streakDays: number;
}> {
  const [tracksRes, sessionsRes] = await Promise.all([
    supabase.from("learning_tracks").select("status, hours_logged"),
    supabase.from("learning_sessions").select("logged_at").order("logged_at", { ascending: false }).limit(90),
  ]);

  const tracks = (tracksRes.data as { status: string; hours_logged: number }[]) || [];
  const totalHours = tracks.reduce((sum, t) => sum + Number(t.hours_logged || 0), 0);
  const activeTracks = tracks.filter((t) => t.status === "active").length;
  const completedTracks = tracks.filter((t) => t.status === "completed").length;

  // Compute streak — consecutive days with ≥1 session
  const sessions = (sessionsRes.data as { logged_at: string }[]) || [];
  const daySet = new Set(sessions.map((s) => s.logged_at.slice(0, 10)));
  let streak = 0;
  const today = new Date();
  for (let i = 0; i < 90; i++) {
    const d = new Date(today);
    d.setDate(today.getDate() - i);
    const key = d.toISOString().slice(0, 10);
    if (daySet.has(key)) {
      streak++;
    } else if (i > 0) {
      break;
    }
  }

  return { totalHours, activeTracks, completedTracks, streakDays: streak };
}

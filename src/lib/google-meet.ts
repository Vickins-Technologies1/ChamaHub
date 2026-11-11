type MeetSpaceConfig = {
  accessType?: "OPEN" | "TRUSTED" | "RESTRICTED";
  entryPointAccess?: "ALL" | "CREATOR_APP_ONLY";
  autoRecording?: boolean;
  autoTranscription?: boolean;
  autoSmartNotes?: boolean;
};

type MeetSpaceResponse = {
  name?: string;
  meetingUri?: string;
  meetingCode?: string;
};

type MeetConferenceRecord = {
  name?: string;
  startTime?: string;
  endTime?: string;
  space?: { name?: string; meetingCode?: string };
};

type MeetParticipant = {
  name?: string;
  earliestStartTime?: string;
  latestEndTime?: string;
  signedinUser?: { displayName?: string; user?: string };
  signedInUser?: { displayName?: string; user?: string };
  anonymousUser?: { displayName?: string };
  phoneUser?: { displayName?: string };
};

type MeetParticipantSession = {
  name?: string;
  startTime?: string;
  endTime?: string;
};

const MEET_API_BASE = "https://meet.googleapis.com/v2";

const getEnv = (key: string) => {
  const value = process.env[key];
  if (!value) {
    throw new Error(`Missing ${key} environment variable for Google Meet.`);
  }
  return value;
};

const getAccessToken = async () => {
  const clientId = getEnv("GOOGLE_MEET_CLIENT_ID");
  const clientSecret = getEnv("GOOGLE_MEET_CLIENT_SECRET");
  const refreshToken = getEnv("GOOGLE_MEET_REFRESH_TOKEN");

  const body = new URLSearchParams({
    client_id: clientId,
    client_secret: clientSecret,
    refresh_token: refreshToken,
    grant_type: "refresh_token",
  });

  const response = await fetch("https://oauth2.googleapis.com/token", {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body,
  });

  if (!response.ok) {
    throw new Error("Unable to authenticate with Google Meet API.");
  }
  const data = (await response.json()) as { access_token?: string };
  if (!data.access_token) {
    throw new Error("Missing access token from Google Meet API.");
  }
  return data.access_token;
};

const meetFetch = async <T>(path: string, init?: RequestInit): Promise<T> => {
  const token = await getAccessToken();
  const response = await fetch(`${MEET_API_BASE}${path}`, {
    ...init,
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${token}`,
      ...(init?.headers ?? {}),
    },
  });

  if (!response.ok) {
    const errorText = await response.text();
    throw new Error(errorText || "Google Meet API request failed.");
  }

  return (await response.json()) as T;
};

export const createMeetSpace = async (config: MeetSpaceConfig) => {
  const body: Record<string, unknown> = {};
  const spaceConfig: Record<string, unknown> = {};

  if (config.accessType) spaceConfig.accessType = config.accessType;
  if (config.entryPointAccess) spaceConfig.entryPointAccess = config.entryPointAccess;

  const artifactConfig: Record<string, unknown> = {};
  if (config.autoRecording !== undefined) {
    artifactConfig.recordingConfig = {
      autoRecordingGeneration: config.autoRecording ? "ON" : "OFF",
    };
  }
  if (config.autoTranscription !== undefined) {
    artifactConfig.transcriptionConfig = {
      autoTranscriptionGeneration: config.autoTranscription ? "ON" : "OFF",
    };
  }
  if (config.autoSmartNotes !== undefined) {
    artifactConfig.smartNotesConfig = {
      autoSmartNotesGeneration: config.autoSmartNotes ? "ON" : "OFF",
    };
  }
  if (Object.keys(artifactConfig).length > 0) {
    spaceConfig.artifactConfig = artifactConfig;
  }

  if (Object.keys(spaceConfig).length > 0) {
    body.config = spaceConfig;
  }

  return meetFetch<MeetSpaceResponse>("/spaces", {
    method: "POST",
    body: JSON.stringify(body),
  });
};

export const getMeetSpace = async (spaceName: string) => {
  const cleaned = spaceName.replace(/^spaces\//, "");
  return meetFetch<MeetSpaceResponse>(`/spaces/${cleaned}`, { method: "GET" });
};

export const listConferenceRecords = async (input: {
  filter?: string;
  pageSize?: number;
}) => {
  const url = new URL(`${MEET_API_BASE}/conferenceRecords`);
  if (input.pageSize) url.searchParams.set("pageSize", String(input.pageSize));
  if (input.filter) url.searchParams.set("filter", input.filter);

  const token = await getAccessToken();
  const response = await fetch(url.toString(), {
    method: "GET",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${token}`,
    },
  });

  if (!response.ok) {
    const errorText = await response.text();
    throw new Error(errorText || "Google Meet API request failed.");
  }

  return (await response.json()) as {
    conferenceRecords?: MeetConferenceRecord[];
    nextPageToken?: string;
  };
};

export const listParticipants = async (conferenceRecordName: string, pageSize = 100) => {
  const cleaned = conferenceRecordName.replace(/^conferenceRecords\//, "");
  const participants: MeetParticipant[] = [];
  let pageToken: string | undefined;

  for (let i = 0; i < 20; i += 1) {
    const url = new URL(
      `${MEET_API_BASE}/conferenceRecords/${encodeURIComponent(cleaned)}/participants`
    );
    url.searchParams.set("pageSize", String(pageSize));
    if (pageToken) url.searchParams.set("pageToken", pageToken);

    const token = await getAccessToken();
    const response = await fetch(url.toString(), {
      method: "GET",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${token}`,
      },
    });

    if (!response.ok) {
      const errorText = await response.text();
      throw new Error(errorText || "Google Meet API request failed.");
    }

    const data = (await response.json()) as {
      participants?: MeetParticipant[];
      nextPageToken?: string;
    };

    participants.push(...(data.participants ?? []));
    if (!data.nextPageToken) break;
    pageToken = data.nextPageToken;
  }

  return participants;
};

export const listParticipantSessions = async (participantName: string, pageSize = 100) => {
  const cleaned = participantName.replace(/^conferenceRecords\//, "");
  const encodedPath = cleaned
    .split("/")
    .map((segment) => encodeURIComponent(segment))
    .join("/");
  const sessions: MeetParticipantSession[] = [];
  let pageToken: string | undefined;

  for (let i = 0; i < 20; i += 1) {
    const url = new URL(
      `${MEET_API_BASE}/conferenceRecords/${encodedPath}/participantSessions`
    );
    url.searchParams.set("pageSize", String(pageSize));
    if (pageToken) url.searchParams.set("pageToken", pageToken);

    const token = await getAccessToken();
    const response = await fetch(url.toString(), {
      method: "GET",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${token}`,
      },
    });

    if (!response.ok) {
      const errorText = await response.text();
      throw new Error(errorText || "Google Meet API request failed.");
    }

    const data = (await response.json()) as {
      participantSessions?: MeetParticipantSession[];
      nextPageToken?: string;
    };

    sessions.push(...(data.participantSessions ?? []));
    if (!data.nextPageToken) break;
    pageToken = data.nextPageToken;
  }

  return sessions;
};

export const pickConferenceRecordForSpace = async (input: {
  spaceName: string;
  scheduledFor?: Date;
}) => {
  const cleaned = input.spaceName.replace(/^spaces\//, "");
  const spaceFilter = `space.name="spaces/${cleaned}"`;

  let filter = spaceFilter;
  if (input.scheduledFor) {
    const start = new Date(input.scheduledFor.getTime() - 12 * 60 * 60 * 1000).toISOString();
    const end = new Date(input.scheduledFor.getTime() + 12 * 60 * 60 * 1000).toISOString();
    filter = `${spaceFilter} AND start_time>="${start}" AND start_time<="${end}"`;
  }

  const data = await listConferenceRecords({ filter, pageSize: 25 });
  const records = data.conferenceRecords ?? [];
  if (records.length === 0) return null;

  if (!input.scheduledFor) {
    // Default ordering is typically by start time desc, but don't rely on it.
    return records
      .slice()
      .sort((a, b) => (b.startTime || "").localeCompare(a.startTime || ""))[0];
  }

  const target = input.scheduledFor.getTime();
  return records
    .slice()
    .sort((a, b) => {
      const da = a.startTime ? Math.abs(new Date(a.startTime).getTime() - target) : Number.POSITIVE_INFINITY;
      const db = b.startTime ? Math.abs(new Date(b.startTime).getTime() - target) : Number.POSITIVE_INFINITY;
      return da - db;
    })[0];
};

export type { MeetConferenceRecord, MeetParticipant, MeetParticipantSession };

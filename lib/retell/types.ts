// lib/retell/types.ts

/** Shape of a single record from Retell's GET /list-calls */
export interface RetellCallRecord {
  call_id: string;
  agent_id: string;
  agent_name?: string;
  call_status: "ended" | "error" | "ongoing" | "registered";
  disconnection_reason?: string;
  start_timestamp: number;        // epoch ms
  end_timestamp: number;          // epoch ms
  duration_seconds: number;
  from_number?: string;
  to_number?: string;
  recording_url?: string;
  transcript?: string;
  transcript_object?: RetellTranscriptTurn[];
  call_analysis?: {
    call_successful?: boolean;
    user_sentiment?: "Positive" | "Neutral" | "Negative";
    call_summary?: string;
  };
}

export interface RetellTranscriptTurn {
  role: "agent" | "user";
  content: string;
  timestamp_ms: number;
  sentiment?: "Positive" | "Neutral" | "Negative";
}

/** Shape of Retell's GET /get-agent/{agent_id} response. */
export interface RetellAgent {
  agent_id: string;
  agent_name?: string;
  /** Retell voice id (e.g. "11labs-Adrian"). */
  voice_id?: string;
  response_engine?: {
    llm?: {
      model?: string;
      /** The system prompt / conversation script. */
      prompt?: string;
    };
    voice_id?: string;
  };
  /** Inbound phone number this agent answers on. */
  inbound_phone_number?: string;
  phone_number?: string;
  // Several Retell payloads nest the number differently; tolerate both.
  [key: string]: unknown;
}
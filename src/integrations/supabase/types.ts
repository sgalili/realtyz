export type Json =
  | string
  | number
  | boolean
  | null
  | { [key: string]: Json | undefined }
  | Json[]

export type Database = {
  // Allows to automatically instantiate createClient with right options
  // instead of createClient<Database, { PostgrestVersion: 'XX' }>(URL, KEY)
  __InternalSupabase: {
    PostgrestVersion: "14.5"
  }
  public: {
    Tables: {
      admin_leads: {
        Row: {
          attempted_target: number | null
          created_at: string
          current_target: number | null
          election_type: string | null
          id: string
          lead_type: string
          metadata: Json
          status: string
          updated_at: string
          user_email: string | null
          user_id: string
        }
        Insert: {
          attempted_target?: number | null
          created_at?: string
          current_target?: number | null
          election_type?: string | null
          id?: string
          lead_type?: string
          metadata?: Json
          status?: string
          updated_at?: string
          user_email?: string | null
          user_id: string
        }
        Update: {
          attempted_target?: number | null
          created_at?: string
          current_target?: number | null
          election_type?: string | null
          id?: string
          lead_type?: string
          metadata?: Json
          status?: string
          updated_at?: string
          user_email?: string | null
          user_id?: string
        }
        Relationships: []
      }
      ai_content_logs: {
        Row: {
          created_at: string | null
          created_by: string | null
          generated_text: string | null
          id: string
          platform: string | null
          topic: string | null
        }
        Insert: {
          created_at?: string | null
          created_by?: string | null
          generated_text?: string | null
          id?: string
          platform?: string | null
          topic?: string | null
        }
        Update: {
          created_at?: string | null
          created_by?: string | null
          generated_text?: string | null
          id?: string
          platform?: string | null
          topic?: string | null
        }
        Relationships: []
      }
      api_configs: {
        Row: {
          api_key: string
          id: string
          is_active: boolean | null
          service_name: string
          updated_at: string | null
          webhook_url: string | null
        }
        Insert: {
          api_key: string
          id?: string
          is_active?: boolean | null
          service_name: string
          updated_at?: string | null
          webhook_url?: string | null
        }
        Update: {
          api_key?: string
          id?: string
          is_active?: boolean | null
          service_name?: string
          updated_at?: string | null
          webhook_url?: string | null
        }
        Relationships: []
      }
      approval_queue: {
        Row: {
          approved_at: string | null
          approved_by: string | null
          confidence_score: number
          content_type: string
          created_at: string
          created_by_ai: boolean
          edited_content: string | null
          id: string
          live_post_url: string | null
          low_confidence_reason: string | null
          metadata: Json
          platform: string
          posted_at: string | null
          posted_by: string | null
          proposed_content: string
          rejected_at: string | null
          rejected_by: string | null
          rejection_reason: string | null
          requires_human_review: boolean
          source_citations: Json
          status: string
          target_label: string | null
          target_voter_id: string | null
          title: string
          updated_at: string
          user_id: string
        }
        Insert: {
          approved_at?: string | null
          approved_by?: string | null
          confidence_score?: number
          content_type?: string
          created_at?: string
          created_by_ai?: boolean
          edited_content?: string | null
          id?: string
          live_post_url?: string | null
          low_confidence_reason?: string | null
          metadata?: Json
          platform?: string
          posted_at?: string | null
          posted_by?: string | null
          proposed_content: string
          rejected_at?: string | null
          rejected_by?: string | null
          rejection_reason?: string | null
          requires_human_review?: boolean
          source_citations?: Json
          status?: string
          target_label?: string | null
          target_voter_id?: string | null
          title: string
          updated_at?: string
          user_id: string
        }
        Update: {
          approved_at?: string | null
          approved_by?: string | null
          confidence_score?: number
          content_type?: string
          created_at?: string
          created_by_ai?: boolean
          edited_content?: string | null
          id?: string
          live_post_url?: string | null
          low_confidence_reason?: string | null
          metadata?: Json
          platform?: string
          posted_at?: string | null
          posted_by?: string | null
          proposed_content?: string
          rejected_at?: string | null
          rejected_by?: string | null
          rejection_reason?: string | null
          requires_human_review?: boolean
          source_citations?: Json
          status?: string
          target_label?: string | null
          target_voter_id?: string | null
          title?: string
          updated_at?: string
          user_id?: string
        }
        Relationships: []
      }
      audit_logs: {
        Row: {
          action: string
          actor_email: string | null
          actor_id: string
          created_at: string
          details: Json | null
          id: string
          ip_address: string | null
          target_id: string | null
          target_table: string | null
        }
        Insert: {
          action: string
          actor_email?: string | null
          actor_id: string
          created_at?: string
          details?: Json | null
          id?: string
          ip_address?: string | null
          target_id?: string | null
          target_table?: string | null
        }
        Update: {
          action?: string
          actor_email?: string | null
          actor_id?: string
          created_at?: string
          details?: Json | null
          id?: string
          ip_address?: string | null
          target_id?: string | null
          target_table?: string | null
        }
        Relationships: []
      }
      autopilot_queue: {
        Row: {
          attempts: number
          campaign_id: string | null
          created_at: string
          id: string
          last_error: string | null
          lead_id: string
          locked_at: string | null
          locked_by: string | null
          max_attempts: number
          message_content: string
          message_id: string | null
          scheduled_at: string
          sent_at: string | null
          status: string
          template_id: string | null
          updated_at: string
          user_id: string
        }
        Insert: {
          attempts?: number
          campaign_id?: string | null
          created_at?: string
          id?: string
          last_error?: string | null
          lead_id: string
          locked_at?: string | null
          locked_by?: string | null
          max_attempts?: number
          message_content: string
          message_id?: string | null
          scheduled_at?: string
          sent_at?: string | null
          status?: string
          template_id?: string | null
          updated_at?: string
          user_id: string
        }
        Update: {
          attempts?: number
          campaign_id?: string | null
          created_at?: string
          id?: string
          last_error?: string | null
          lead_id?: string
          locked_at?: string | null
          locked_by?: string | null
          max_attempts?: number
          message_content?: string
          message_id?: string | null
          scheduled_at?: string
          sent_at?: string | null
          status?: string
          template_id?: string | null
          updated_at?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "autopilot_queue_lead_id_fkey"
            columns: ["lead_id"]
            isOneToOne: false
            referencedRelation: "leads"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "autopilot_queue_message_id_fkey"
            columns: ["message_id"]
            isOneToOne: false
            referencedRelation: "messages"
            referencedColumns: ["id"]
          },
        ]
      }
      balance_adjustments: {
        Row: {
          amount: number
          created_at: string
          created_by: string | null
          id: string
          reason: string | null
          user_id: string
        }
        Insert: {
          amount: number
          created_at?: string
          created_by?: string | null
          id?: string
          reason?: string | null
          user_id: string
        }
        Update: {
          amount?: number
          created_at?: string
          created_by?: string | null
          id?: string
          reason?: string | null
          user_id?: string
        }
        Relationships: []
      }
      budget_limits: {
        Row: {
          created_at: string
          hard_stop: boolean
          id: string
          monthly_limit: number
          service_type: string
          updated_at: string
          user_id: string
        }
        Insert: {
          created_at?: string
          hard_stop?: boolean
          id?: string
          monthly_limit?: number
          service_type: string
          updated_at?: string
          user_id: string
        }
        Update: {
          created_at?: string
          hard_stop?: boolean
          id?: string
          monthly_limit?: number
          service_type?: string
          updated_at?: string
          user_id?: string
        }
        Relationships: []
      }
      campaign_logs: {
        Row: {
          campaign_name: string
          channel: string
          cost: number
          created_at: string
          failure_reason: string | null
          id: string
          message_body: string | null
          provider_message_id: string | null
          provider_response: Json
          recipient_email: string | null
          recipient_name: string | null
          recipient_phone: string | null
          sent_at: string | null
          source_account: string | null
          status: string
          user_id: string
          voter_id: string | null
        }
        Insert: {
          campaign_name: string
          channel: string
          cost?: number
          created_at?: string
          failure_reason?: string | null
          id?: string
          message_body?: string | null
          provider_message_id?: string | null
          provider_response?: Json
          recipient_email?: string | null
          recipient_name?: string | null
          recipient_phone?: string | null
          sent_at?: string | null
          source_account?: string | null
          status?: string
          user_id: string
          voter_id?: string | null
        }
        Update: {
          campaign_name?: string
          channel?: string
          cost?: number
          created_at?: string
          failure_reason?: string | null
          id?: string
          message_body?: string | null
          provider_message_id?: string | null
          provider_response?: Json
          recipient_email?: string | null
          recipient_name?: string | null
          recipient_phone?: string | null
          sent_at?: string | null
          source_account?: string | null
          status?: string
          user_id?: string
          voter_id?: string | null
        }
        Relationships: []
      }
      campaign_settings: {
        Row: {
          created_at: string
          id: string
          key: string
          updated_at: string
          updated_by: string | null
          value: string | null
        }
        Insert: {
          created_at?: string
          id?: string
          key: string
          updated_at?: string
          updated_by?: string | null
          value?: string | null
        }
        Update: {
          created_at?: string
          id?: string
          key?: string
          updated_at?: string
          updated_by?: string | null
          value?: string | null
        }
        Relationships: []
      }
      campaigns: {
        Row: {
          created_at: string | null
          description: string | null
          id: string
          name: string
          sms_body: string | null
          tag_associated: string | null
          total_clicks: number | null
          total_sent: number | null
        }
        Insert: {
          created_at?: string | null
          description?: string | null
          id?: string
          name: string
          sms_body?: string | null
          tag_associated?: string | null
          total_clicks?: number | null
          total_sent?: number | null
        }
        Update: {
          created_at?: string | null
          description?: string | null
          id?: string
          name?: string
          sms_body?: string | null
          tag_associated?: string | null
          total_clicks?: number | null
          total_sent?: number | null
        }
        Relationships: []
      }
      chat_history: {
        Row: {
          content: string | null
          created_at: string | null
          id: string
          is_demo: boolean
          lead_id: string | null
          role: string | null
          sentiment: string | null
        }
        Insert: {
          content?: string | null
          created_at?: string | null
          id?: string
          is_demo?: boolean
          lead_id?: string | null
          role?: string | null
          sentiment?: string | null
        }
        Update: {
          content?: string | null
          created_at?: string | null
          id?: string
          is_demo?: boolean
          lead_id?: string | null
          role?: string | null
          sentiment?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "chat_history_lead_id_fkey"
            columns: ["lead_id"]
            isOneToOne: false
            referencedRelation: "leads"
            referencedColumns: ["id"]
          },
        ]
      }
      contact_submissions: {
        Row: {
          created_at: string
          email: string | null
          full_name: string
          id: string
          message: string | null
          phone_number: string
          status: string | null
          tag: string | null
          updated_at: string
          wa_sent: boolean | null
        }
        Insert: {
          created_at?: string
          email?: string | null
          full_name: string
          id?: string
          message?: string | null
          phone_number: string
          status?: string | null
          tag?: string | null
          updated_at?: string
          wa_sent?: boolean | null
        }
        Update: {
          created_at?: string
          email?: string | null
          full_name?: string
          id?: string
          message?: string | null
          phone_number?: string
          status?: string | null
          tag?: string | null
          updated_at?: string
          wa_sent?: boolean | null
        }
        Relationships: []
      }
      crisis_alerts: {
        Row: {
          affected_segment: string | null
          affected_topic: string | null
          coordinated_attack_score: number
          created_at: string
          id: string
          negative_count: number
          notification_result: Json
          notified_whatsapp: boolean
          resolved_at: string | null
          response_options: Json
          severity: string
          source_platform: string
          source_url: string | null
          status: string
          summary: string
          title: string
          trigger_type: string
          updated_at: string
          user_id: string
        }
        Insert: {
          affected_segment?: string | null
          affected_topic?: string | null
          coordinated_attack_score?: number
          created_at?: string
          id?: string
          negative_count?: number
          notification_result?: Json
          notified_whatsapp?: boolean
          resolved_at?: string | null
          response_options?: Json
          severity?: string
          source_platform?: string
          source_url?: string | null
          status?: string
          summary: string
          title: string
          trigger_type?: string
          updated_at?: string
          user_id: string
        }
        Update: {
          affected_segment?: string | null
          affected_topic?: string | null
          coordinated_attack_score?: number
          created_at?: string
          id?: string
          negative_count?: number
          notification_result?: Json
          notified_whatsapp?: boolean
          resolved_at?: string | null
          response_options?: Json
          severity?: string
          source_platform?: string
          source_url?: string | null
          status?: string
          summary?: string
          title?: string
          trigger_type?: string
          updated_at?: string
          user_id?: string
        }
        Relationships: []
      }
      demo_captured_leads: {
        Row: {
          archetype: string | null
          created_at: string
          email: string | null
          engagement_score: number
          id: string
          metadata: Json
          phone_number: string | null
          session_id: string | null
          value_trap_type: string
        }
        Insert: {
          archetype?: string | null
          created_at?: string
          email?: string | null
          engagement_score?: number
          id?: string
          metadata?: Json
          phone_number?: string | null
          session_id?: string | null
          value_trap_type?: string
        }
        Update: {
          archetype?: string | null
          created_at?: string
          email?: string | null
          engagement_score?: number
          id?: string
          metadata?: Json
          phone_number?: string | null
          session_id?: string | null
          value_trap_type?: string
        }
        Relationships: []
      }
      demo_sessions: {
        Row: {
          archetype: string | null
          current_route: string
          first_seen_at: string
          id: string
          last_seen_at: string
          metadata: Json
          referrer: string | null
          session_id: string
          user_agent: string | null
        }
        Insert: {
          archetype?: string | null
          current_route?: string
          first_seen_at?: string
          id?: string
          last_seen_at?: string
          metadata?: Json
          referrer?: string | null
          session_id: string
          user_agent?: string | null
        }
        Update: {
          archetype?: string | null
          current_route?: string
          first_seen_at?: string
          id?: string
          last_seen_at?: string
          metadata?: Json
          referrer?: string | null
          session_id?: string
          user_agent?: string | null
        }
        Relationships: []
      }
      drip_campaigns: {
        Row: {
          channel: string
          created_at: string
          daily_limit: number
          id: string
          label: string
          metadata: Json
          scheduled_item_id: string | null
          send_window_end: string
          send_window_start: string
          sent_count: number
          stagger_max_minutes: number
          stagger_min_minutes: number
          status: string
          total_recipients: number
          updated_at: string
          user_id: string
        }
        Insert: {
          channel?: string
          created_at?: string
          daily_limit?: number
          id?: string
          label: string
          metadata?: Json
          scheduled_item_id?: string | null
          send_window_end?: string
          send_window_start?: string
          sent_count?: number
          stagger_max_minutes?: number
          stagger_min_minutes?: number
          status?: string
          total_recipients?: number
          updated_at?: string
          user_id: string
        }
        Update: {
          channel?: string
          created_at?: string
          daily_limit?: number
          id?: string
          label?: string
          metadata?: Json
          scheduled_item_id?: string | null
          send_window_end?: string
          send_window_start?: string
          sent_count?: number
          stagger_max_minutes?: number
          stagger_min_minutes?: number
          status?: string
          total_recipients?: number
          updated_at?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "drip_campaigns_scheduled_item_id_fkey"
            columns: ["scheduled_item_id"]
            isOneToOne: false
            referencedRelation: "scheduled_items"
            referencedColumns: ["id"]
          },
        ]
      }
      interaction_activity_log: {
        Row: {
          action_type: string
          actor_id: string | null
          actor_label: string | null
          actor_type: string
          approval_queue_id: string | null
          confidence_score: number | null
          content: string
          created_at: string
          id: string
          live_post_url: string | null
          metadata: Json
          parent_id: string | null
          platform: string
          sentiment: string | null
          source_citations: Json
          thread_key: string
          user_id: string
        }
        Insert: {
          action_type?: string
          actor_id?: string | null
          actor_label?: string | null
          actor_type?: string
          approval_queue_id?: string | null
          confidence_score?: number | null
          content: string
          created_at?: string
          id?: string
          live_post_url?: string | null
          metadata?: Json
          parent_id?: string | null
          platform?: string
          sentiment?: string | null
          source_citations?: Json
          thread_key: string
          user_id: string
        }
        Update: {
          action_type?: string
          actor_id?: string | null
          actor_label?: string | null
          actor_type?: string
          approval_queue_id?: string | null
          confidence_score?: number | null
          content?: string
          created_at?: string
          id?: string
          live_post_url?: string | null
          metadata?: Json
          parent_id?: string | null
          platform?: string
          sentiment?: string | null
          source_citations?: Json
          thread_key?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "interaction_activity_log_approval_queue_id_fkey"
            columns: ["approval_queue_id"]
            isOneToOne: false
            referencedRelation: "approval_queue"
            referencedColumns: ["id"]
          },
        ]
      }
      kb_whitelist: {
        Row: {
          created_at: string
          id: string
          label: string | null
          phone_number: string
          user_id: string
        }
        Insert: {
          created_at?: string
          id?: string
          label?: string | null
          phone_number: string
          user_id: string
        }
        Update: {
          created_at?: string
          id?: string
          label?: string | null
          phone_number?: string
          user_id?: string
        }
        Relationships: []
      }
      knowledge_chunks: {
        Row: {
          chunk_index: number
          content: string
          created_at: string
          document_id: string
          embedding: string | null
          id: string
          user_id: string
        }
        Insert: {
          chunk_index: number
          content: string
          created_at?: string
          document_id: string
          embedding?: string | null
          id?: string
          user_id: string
        }
        Update: {
          chunk_index?: number
          content?: string
          created_at?: string
          document_id?: string
          embedding?: string | null
          id?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "knowledge_chunks_document_id_fkey"
            columns: ["document_id"]
            isOneToOne: false
            referencedRelation: "knowledge_documents"
            referencedColumns: ["id"]
          },
        ]
      }
      knowledge_documents: {
        Row: {
          chunk_count: number
          created_at: string
          file_path: string | null
          id: string
          is_active: boolean
          raw_text: string | null
          source_metadata: Json | null
          source_type: string
          title: string
          updated_at: string
          user_id: string
        }
        Insert: {
          chunk_count?: number
          created_at?: string
          file_path?: string | null
          id?: string
          is_active?: boolean
          raw_text?: string | null
          source_metadata?: Json | null
          source_type?: string
          title: string
          updated_at?: string
          user_id: string
        }
        Update: {
          chunk_count?: number
          created_at?: string
          file_path?: string | null
          id?: string
          is_active?: boolean
          raw_text?: string | null
          source_metadata?: Json | null
          source_type?: string
          title?: string
          updated_at?: string
          user_id?: string
        }
        Relationships: []
      }
      leads: {
        Row: {
          ai_autopilot: boolean | null
          city: string | null
          created_at: string | null
          email: string | null
          engagement_score: number | null
          fts: unknown
          full_name: string | null
          id: string
          identity_number: string | null
          instagram_handle: string | null
          interest_score_json: Json | null
          interest_scores: Json | null
          interest_tag: string | null
          is_demo: boolean
          is_voted: boolean | null
          last_interaction_at: string | null
          lead_stage: string
          loyalty_tier: string | null
          messenger_id: string | null
          phone_number: string
          preferences: Json
          profile_picture_url: string | null
          sentiment: string | null
          status: string | null
          telegram_username: string | null
        }
        Insert: {
          ai_autopilot?: boolean | null
          city?: string | null
          created_at?: string | null
          email?: string | null
          engagement_score?: number | null
          fts?: unknown
          full_name?: string | null
          id?: string
          identity_number?: string | null
          instagram_handle?: string | null
          interest_score_json?: Json | null
          interest_scores?: Json | null
          interest_tag?: string | null
          is_demo?: boolean
          is_voted?: boolean | null
          last_interaction_at?: string | null
          lead_stage?: string
          loyalty_tier?: string | null
          messenger_id?: string | null
          phone_number: string
          preferences?: Json
          profile_picture_url?: string | null
          sentiment?: string | null
          status?: string | null
          telegram_username?: string | null
        }
        Update: {
          ai_autopilot?: boolean | null
          city?: string | null
          created_at?: string | null
          email?: string | null
          engagement_score?: number | null
          fts?: unknown
          full_name?: string | null
          id?: string
          identity_number?: string | null
          instagram_handle?: string | null
          interest_score_json?: Json | null
          interest_scores?: Json | null
          interest_tag?: string | null
          is_demo?: boolean
          is_voted?: boolean | null
          last_interaction_at?: string | null
          lead_stage?: string
          loyalty_tier?: string | null
          messenger_id?: string | null
          phone_number?: string
          preferences?: Json
          profile_picture_url?: string | null
          sentiment?: string | null
          status?: string | null
          telegram_username?: string | null
        }
        Relationships: []
      }
      listings: {
        Row: {
          asking_price: number
          candidate_name: string
          created_at: string
          description: string
          election_type: string
          features: Json
          headline: string
          id: string
          is_published: boolean
          mandate_goal: number
          pillars: Json
          property_title: string
          slug: string
          supporter_count: number
          thesis: string
          updated_at: string
          user_id: string
        }
        Insert: {
          asking_price?: number
          candidate_name: string
          created_at?: string
          description: string
          election_type?: string
          features?: Json
          headline: string
          id?: string
          is_published?: boolean
          mandate_goal?: number
          pillars?: Json
          property_title: string
          slug: string
          supporter_count?: number
          thesis: string
          updated_at?: string
          user_id: string
        }
        Update: {
          asking_price?: number
          candidate_name?: string
          created_at?: string
          description?: string
          election_type?: string
          features?: Json
          headline?: string
          id?: string
          is_published?: boolean
          mandate_goal?: number
          pillars?: Json
          property_title?: string
          slug?: string
          supporter_count?: number
          thesis?: string
          updated_at?: string
          user_id?: string
        }
        Relationships: []
      }
      messages: {
        Row: {
          channel: string | null
          content: string | null
          created_at: string | null
          direction: string | null
          id: string
          lead_id: string | null
          metadata: Json | null
          platform: string | null
          sender_type: string | null
        }
        Insert: {
          channel?: string | null
          content?: string | null
          created_at?: string | null
          direction?: string | null
          id?: string
          lead_id?: string | null
          metadata?: Json | null
          platform?: string | null
          sender_type?: string | null
        }
        Update: {
          channel?: string | null
          content?: string | null
          created_at?: string | null
          direction?: string | null
          id?: string
          lead_id?: string | null
          metadata?: Json | null
          platform?: string | null
          sender_type?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "messages_lead_id_fkey"
            columns: ["lead_id"]
            isOneToOne: false
            referencedRelation: "leads"
            referencedColumns: ["id"]
          },
        ]
      }
      meta_ad_campaigns: {
        Row: {
          audience_type: string
          created_at: string
          creative_variants: Json
          daily_budget: number
          id: string
          meta_campaign_id: string | null
          metrics: Json
          name: string
          objective: string
          status: string
          updated_at: string
          user_id: string
        }
        Insert: {
          audience_type?: string
          created_at?: string
          creative_variants?: Json
          daily_budget?: number
          id?: string
          meta_campaign_id?: string | null
          metrics?: Json
          name: string
          objective?: string
          status?: string
          updated_at?: string
          user_id: string
        }
        Update: {
          audience_type?: string
          created_at?: string
          creative_variants?: Json
          daily_budget?: number
          id?: string
          meta_campaign_id?: string | null
          metrics?: Json
          name?: string
          objective?: string
          status?: string
          updated_at?: string
          user_id?: string
        }
        Relationships: []
      }
      onboarding_state: {
        Row: {
          candidate_or_party: string | null
          cold_conversion_rate: number
          cold_list_count: number | null
          completed_at: string | null
          created_at: string
          election_type: string | null
          hot_conversion_rate: number
          hot_list_count: number | null
          id: string
          initial_message: string | null
          mandate_target: number | null
          months_to_election: number | null
          step: number
          tone: string | null
          updated_at: string
          user_id: string
        }
        Insert: {
          candidate_or_party?: string | null
          cold_conversion_rate?: number
          cold_list_count?: number | null
          completed_at?: string | null
          created_at?: string
          election_type?: string | null
          hot_conversion_rate?: number
          hot_list_count?: number | null
          id?: string
          initial_message?: string | null
          mandate_target?: number | null
          months_to_election?: number | null
          step?: number
          tone?: string | null
          updated_at?: string
          user_id: string
        }
        Update: {
          candidate_or_party?: string | null
          cold_conversion_rate?: number
          cold_list_count?: number | null
          completed_at?: string | null
          created_at?: string
          election_type?: string | null
          hot_conversion_rate?: number
          hot_list_count?: number | null
          id?: string
          initial_message?: string | null
          mandate_target?: number | null
          months_to_election?: number | null
          step?: number
          tone?: string | null
          updated_at?: string
          user_id?: string
        }
        Relationships: []
      }
      platform_oauth_apps: {
        Row: {
          client_id: string | null
          client_secret: string | null
          created_at: string
          id: string
          notes: string | null
          platform: string
          updated_at: string
          updated_by: string | null
        }
        Insert: {
          client_id?: string | null
          client_secret?: string | null
          created_at?: string
          id?: string
          notes?: string | null
          platform: string
          updated_at?: string
          updated_by?: string | null
        }
        Update: {
          client_id?: string | null
          client_secret?: string | null
          created_at?: string
          id?: string
          notes?: string | null
          platform?: string
          updated_at?: string
          updated_by?: string | null
        }
        Relationships: []
      }
      pricing_plans: {
        Row: {
          created_at: string
          description_he: string | null
          features: Json
          id: string
          included_ai_touchpoints: number
          included_sms: number
          included_voice_minutes: number
          included_whatsapp: number
          is_active: boolean
          mandates_target: number
          monthly_price: number
          name_he: string
          setup_fee: number
          slug: string
          sort_order: number
        }
        Insert: {
          created_at?: string
          description_he?: string | null
          features?: Json
          id?: string
          included_ai_touchpoints: number
          included_sms: number
          included_voice_minutes: number
          included_whatsapp: number
          is_active?: boolean
          mandates_target: number
          monthly_price: number
          name_he: string
          setup_fee?: number
          slug: string
          sort_order?: number
        }
        Update: {
          created_at?: string
          description_he?: string | null
          features?: Json
          id?: string
          included_ai_touchpoints?: number
          included_sms?: number
          included_voice_minutes?: number
          included_whatsapp?: number
          is_active?: boolean
          mandates_target?: number
          monthly_price?: number
          name_he?: string
          setup_fee?: number
          slug?: string
          sort_order?: number
        }
        Relationships: []
      }
      profiles: {
        Row: {
          avatar_url: string | null
          created_at: string
          email: string | null
          full_name: string | null
          id: string
          is_suspended: boolean
          last_sign_in_at: string | null
          plan_status: string
          trial_start_date: string
          updated_at: string
        }
        Insert: {
          avatar_url?: string | null
          created_at?: string
          email?: string | null
          full_name?: string | null
          id: string
          is_suspended?: boolean
          last_sign_in_at?: string | null
          plan_status?: string
          trial_start_date?: string
          updated_at?: string
        }
        Update: {
          avatar_url?: string | null
          created_at?: string
          email?: string | null
          full_name?: string | null
          id?: string
          is_suspended?: boolean
          last_sign_in_at?: string | null
          plan_status?: string
          trial_start_date?: string
          updated_at?: string
        }
        Relationships: []
      }
      scheduled_items: {
        Row: {
          approval_queue_id: string | null
          channel: string
          content: string
          created_at: string
          daily_limit: number
          drip_enabled: boolean
          id: string
          item_type: string
          metadata: Json
          scheduled_for: string
          send_window_end: string
          send_window_start: string
          sent_count: number
          stagger_max_minutes: number
          stagger_min_minutes: number
          status: string
          target_audience: string | null
          title: string
          total_recipients: number
          updated_at: string
          user_id: string
        }
        Insert: {
          approval_queue_id?: string | null
          channel?: string
          content: string
          created_at?: string
          daily_limit?: number
          drip_enabled?: boolean
          id?: string
          item_type?: string
          metadata?: Json
          scheduled_for: string
          send_window_end?: string
          send_window_start?: string
          sent_count?: number
          stagger_max_minutes?: number
          stagger_min_minutes?: number
          status?: string
          target_audience?: string | null
          title: string
          total_recipients?: number
          updated_at?: string
          user_id: string
        }
        Update: {
          approval_queue_id?: string | null
          channel?: string
          content?: string
          created_at?: string
          daily_limit?: number
          drip_enabled?: boolean
          id?: string
          item_type?: string
          metadata?: Json
          scheduled_for?: string
          send_window_end?: string
          send_window_start?: string
          sent_count?: number
          stagger_max_minutes?: number
          stagger_min_minutes?: number
          status?: string
          target_audience?: string | null
          title?: string
          total_recipients?: number
          updated_at?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "scheduled_items_approval_queue_id_fkey"
            columns: ["approval_queue_id"]
            isOneToOne: false
            referencedRelation: "approval_queue"
            referencedColumns: ["id"]
          },
        ]
      }
      service_toggles: {
        Row: {
          config: Json | null
          created_at: string
          enabled: boolean
          id: string
          service_key: string
          updated_at: string
          user_id: string
        }
        Insert: {
          config?: Json | null
          created_at?: string
          enabled?: boolean
          id?: string
          service_key: string
          updated_at?: string
          user_id: string
        }
        Update: {
          config?: Json | null
          created_at?: string
          enabled?: boolean
          id?: string
          service_key?: string
          updated_at?: string
          user_id?: string
        }
        Relationships: []
      }
      social_connections: {
        Row: {
          connected_at: string | null
          created_at: string
          created_by: string | null
          credentials: Json
          display_name: string
          encrypted_session: string | null
          id: string
          is_connected: boolean
          last_test_at: string | null
          last_test_message: string | null
          last_test_status: string | null
          platform: string
          session_method: string | null
          updated_at: string
        }
        Insert: {
          connected_at?: string | null
          created_at?: string
          created_by?: string | null
          credentials?: Json
          display_name: string
          encrypted_session?: string | null
          id?: string
          is_connected?: boolean
          last_test_at?: string | null
          last_test_message?: string | null
          last_test_status?: string | null
          platform: string
          session_method?: string | null
          updated_at?: string
        }
        Update: {
          connected_at?: string | null
          created_at?: string
          created_by?: string | null
          credentials?: Json
          display_name?: string
          encrypted_session?: string | null
          id?: string
          is_connected?: boolean
          last_test_at?: string | null
          last_test_message?: string | null
          last_test_status?: string | null
          platform?: string
          session_method?: string | null
          updated_at?: string
        }
        Relationships: []
      }
      social_listening_events: {
        Row: {
          ai_reasoning: string | null
          author_handle: string | null
          bot_likelihood: number
          content: string
          created_at: string
          id: string
          metadata: Json
          response_strategies: Json
          risk_score: number
          sentiment_category: string
          source_platform: string
          source_type: string
          source_url: string | null
          topic: string | null
          user_id: string
        }
        Insert: {
          ai_reasoning?: string | null
          author_handle?: string | null
          bot_likelihood?: number
          content: string
          created_at?: string
          id?: string
          metadata?: Json
          response_strategies?: Json
          risk_score?: number
          sentiment_category?: string
          source_platform?: string
          source_type?: string
          source_url?: string | null
          topic?: string | null
          user_id: string
        }
        Update: {
          ai_reasoning?: string | null
          author_handle?: string | null
          bot_likelihood?: number
          content?: string
          created_at?: string
          id?: string
          metadata?: Json
          response_strategies?: Json
          risk_score?: number
          sentiment_category?: string
          source_platform?: string
          source_type?: string
          source_url?: string | null
          topic?: string | null
          user_id?: string
        }
        Relationships: []
      }
      survey_insights: {
        Row: {
          created_at: string
          id: string
          message_recommendations: Json
          row_count: number
          sentiment_by_area: Json
          source_filename: string | null
          summary: string
          swing_voters: Json
          title: string
          top_concerns: Json
          updated_at: string
          user_id: string
          weak_points: Json
        }
        Insert: {
          created_at?: string
          id?: string
          message_recommendations?: Json
          row_count?: number
          sentiment_by_area?: Json
          source_filename?: string | null
          summary: string
          swing_voters?: Json
          title: string
          top_concerns?: Json
          updated_at?: string
          user_id: string
          weak_points?: Json
        }
        Update: {
          created_at?: string
          id?: string
          message_recommendations?: Json
          row_count?: number
          sentiment_by_area?: Json
          source_filename?: string | null
          summary?: string
          swing_voters?: Json
          title?: string
          top_concerns?: Json
          updated_at?: string
          user_id?: string
          weak_points?: Json
        }
        Relationships: []
      }
      test_logs: {
        Row: {
          blast_name: string
          created_at: string
          created_by: string | null
          id: string
          message_body: string
          simulated_cost: number
          status: string
          total_recipients: number
        }
        Insert: {
          blast_name: string
          created_at?: string
          created_by?: string | null
          id?: string
          message_body: string
          simulated_cost?: number
          status?: string
          total_recipients?: number
        }
        Update: {
          blast_name?: string
          created_at?: string
          created_by?: string | null
          id?: string
          message_body?: string
          simulated_cost?: number
          status?: string
          total_recipients?: number
        }
        Relationships: []
      }
      tracking_links: {
        Row: {
          campaign_id: string | null
          click_count: number
          created_at: string
          id: string
          short_code: string
          tag: string | null
          target_url: string
        }
        Insert: {
          campaign_id?: string | null
          click_count?: number
          created_at?: string
          id?: string
          short_code: string
          tag?: string | null
          target_url: string
        }
        Update: {
          campaign_id?: string | null
          click_count?: number
          created_at?: string
          id?: string
          short_code?: string
          tag?: string | null
          target_url?: string
        }
        Relationships: [
          {
            foreignKeyName: "tracking_links_campaign_id_fkey"
            columns: ["campaign_id"]
            isOneToOne: false
            referencedRelation: "campaigns"
            referencedColumns: ["id"]
          },
        ]
      }
      trial_autopilot_messages: {
        Row: {
          created_at: string
          failure_reason: string | null
          id: string
          message_body: string
          provider_message_id: string | null
          recipient_name: string | null
          recipient_phone: string
          scheduled_for: string
          sent_at: string | null
          status: string
          user_id: string
          voter_id: string | null
        }
        Insert: {
          created_at?: string
          failure_reason?: string | null
          id?: string
          message_body: string
          provider_message_id?: string | null
          recipient_name?: string | null
          recipient_phone: string
          scheduled_for?: string
          sent_at?: string | null
          status?: string
          user_id: string
          voter_id?: string | null
        }
        Update: {
          created_at?: string
          failure_reason?: string | null
          id?: string
          message_body?: string
          provider_message_id?: string | null
          recipient_name?: string | null
          recipient_phone?: string
          scheduled_for?: string
          sent_at?: string | null
          status?: string
          user_id?: string
          voter_id?: string | null
        }
        Relationships: []
      }
      trial_inbound_replies: {
        Row: {
          ai_responded_at: string | null
          ai_response: string | null
          created_at: string
          id: string
          message_body: string
          sender_phone: string
          user_id: string
          voter_id: string | null
        }
        Insert: {
          ai_responded_at?: string | null
          ai_response?: string | null
          created_at?: string
          id?: string
          message_body: string
          sender_phone: string
          user_id: string
          voter_id?: string | null
        }
        Update: {
          ai_responded_at?: string | null
          ai_response?: string | null
          created_at?: string
          id?: string
          message_body?: string
          sender_phone?: string
          user_id?: string
          voter_id?: string | null
        }
        Relationships: []
      }
      usage_events: {
        Row: {
          created_at: string
          id: string
          metadata: Json | null
          service_type: string
          total_cost: number
          unit_cost: number
          units: number
          user_id: string
        }
        Insert: {
          created_at?: string
          id?: string
          metadata?: Json | null
          service_type: string
          total_cost?: number
          unit_cost?: number
          units?: number
          user_id: string
        }
        Update: {
          created_at?: string
          id?: string
          metadata?: Json | null
          service_type?: string
          total_cost?: number
          unit_cost?: number
          units?: number
          user_id?: string
        }
        Relationships: []
      }
      user_roles: {
        Row: {
          id: string
          role: Database["public"]["Enums"]["app_role"]
          user_id: string
        }
        Insert: {
          id?: string
          role: Database["public"]["Enums"]["app_role"]
          user_id: string
        }
        Update: {
          id?: string
          role?: Database["public"]["Enums"]["app_role"]
          user_id?: string
        }
        Relationships: []
      }
      user_subscriptions: {
        Row: {
          cold_conversion_rate: number
          cold_list_count: number | null
          created_at: string
          election_type: string
          hot_conversion_rate: number
          hot_list_count: number | null
          id: string
          mandate_target: number | null
          months_to_election: number | null
          plan_id: string | null
          started_at: string
          status: string
          updated_at: string
          user_id: string
        }
        Insert: {
          cold_conversion_rate?: number
          cold_list_count?: number | null
          created_at?: string
          election_type?: string
          hot_conversion_rate?: number
          hot_list_count?: number | null
          id?: string
          mandate_target?: number | null
          months_to_election?: number | null
          plan_id?: string | null
          started_at?: string
          status?: string
          updated_at?: string
          user_id: string
        }
        Update: {
          cold_conversion_rate?: number
          cold_list_count?: number | null
          created_at?: string
          election_type?: string
          hot_conversion_rate?: number
          hot_list_count?: number | null
          id?: string
          mandate_target?: number | null
          months_to_election?: number | null
          plan_id?: string | null
          started_at?: string
          status?: string
          updated_at?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "user_subscriptions_plan_id_fkey"
            columns: ["plan_id"]
            isOneToOne: false
            referencedRelation: "pricing_plans"
            referencedColumns: ["id"]
          },
        ]
      }
      wa_providers: {
        Row: {
          config: Json
          created_at: string
          id: string
          is_active: boolean
          is_official: boolean
          provider_name: string
          tenant_id: string | null
          updated_at: string
          user_id: string | null
        }
        Insert: {
          config?: Json
          created_at?: string
          id?: string
          is_active?: boolean
          is_official?: boolean
          provider_name: string
          tenant_id?: string | null
          updated_at?: string
          user_id?: string | null
        }
        Update: {
          config?: Json
          created_at?: string
          id?: string
          is_active?: boolean
          is_official?: boolean
          provider_name?: string
          tenant_id?: string | null
          updated_at?: string
          user_id?: string | null
        }
        Relationships: []
      }
      whatsapp_login_otps: {
        Row: {
          attempts: number
          code_hash: string
          consumed_at: string | null
          created_at: string
          expires_at: string
          id: string
          phone_number: string
        }
        Insert: {
          attempts?: number
          code_hash: string
          consumed_at?: string | null
          created_at?: string
          expires_at: string
          id?: string
          phone_number: string
        }
        Update: {
          attempts?: number
          code_hash?: string
          consumed_at?: string | null
          created_at?: string
          expires_at?: string
          id?: string
          phone_number?: string
        }
        Relationships: []
      }
    }
    Views: {
      [_ in never]: never
    }
    Functions: {
      bulk_update_leads: {
        Args: {
          lead_ids: string[]
          new_interest_tag?: string
          new_status?: string
        }
        Returns: number
      }
      claim_autopilot_jobs: {
        Args: { p_limit?: number; p_worker?: string }
        Returns: {
          attempts: number
          campaign_id: string | null
          created_at: string
          id: string
          last_error: string | null
          lead_id: string
          locked_at: string | null
          locked_by: string | null
          max_attempts: number
          message_content: string
          message_id: string | null
          scheduled_at: string
          sent_at: string | null
          status: string
          template_id: string | null
          updated_at: string
          user_id: string
        }[]
        SetofOptions: {
          from: "*"
          to: "autopilot_queue"
          isOneToOne: false
          isSetofReturn: true
        }
      }
      cleanup_expired_whatsapp_login_otps: { Args: never; Returns: undefined }
      execute_readonly_query: { Args: { query_text: string }; Returns: Json }
      get_user_balance: {
        Args: { _user_id: string }
        Returns: {
          balance: number
          mtd_spend: number
          total_spend: number
          total_topups: number
        }[]
      }
      has_role: {
        Args: {
          _role: Database["public"]["Enums"]["app_role"]
          _user_id: string
        }
        Returns: boolean
      }
      is_admin_or_above: { Args: { _uid: string }; Returns: boolean }
      is_on_trial_plan: { Args: { _user_id: string }; Returns: boolean }
      is_trial_active: { Args: { _user_id: string }; Returns: boolean }
      match_knowledge_chunks: {
        Args: {
          match_count?: number
          match_user_id: string
          query_embedding: string
        }
        Returns: {
          content: string
          document_id: string
          document_title: string
          id: string
          similarity: number
        }[]
      }
      queue_autopilot_messages: {
        Args: {
          p_campaign_id?: string
          p_lead_ids: string[]
          p_max_delay_sec?: number
          p_message: string
          p_min_delay_sec?: number
          p_template_id?: string
        }
        Returns: {
          first_scheduled_at: string
          last_scheduled_at: string
          queued_count: number
        }[]
      }
      requeue_stuck_autopilot_jobs: { Args: never; Returns: number }
      trial_outbound_used: { Args: { _user_id: string }; Returns: number }
    }
    Enums: {
      app_role: "admin" | "moderator" | "user" | "super_admin"
    }
    CompositeTypes: {
      [_ in never]: never
    }
  }
}

type DatabaseWithoutInternals = Omit<Database, "__InternalSupabase">

type DefaultSchema = DatabaseWithoutInternals[Extract<keyof Database, "public">]

export type Tables<
  DefaultSchemaTableNameOrOptions extends
    | keyof (DefaultSchema["Tables"] & DefaultSchema["Views"])
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof (DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"] &
        DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Views"])
    : never = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? (DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"] &
      DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Views"])[TableName] extends {
      Row: infer R
    }
    ? R
    : never
  : DefaultSchemaTableNameOrOptions extends keyof (DefaultSchema["Tables"] &
        DefaultSchema["Views"])
    ? (DefaultSchema["Tables"] &
        DefaultSchema["Views"])[DefaultSchemaTableNameOrOptions] extends {
        Row: infer R
      }
      ? R
      : never
    : never

export type TablesInsert<
  DefaultSchemaTableNameOrOptions extends
    | keyof DefaultSchema["Tables"]
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"]
    : never = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"][TableName] extends {
      Insert: infer I
    }
    ? I
    : never
  : DefaultSchemaTableNameOrOptions extends keyof DefaultSchema["Tables"]
    ? DefaultSchema["Tables"][DefaultSchemaTableNameOrOptions] extends {
        Insert: infer I
      }
      ? I
      : never
    : never

export type TablesUpdate<
  DefaultSchemaTableNameOrOptions extends
    | keyof DefaultSchema["Tables"]
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"]
    : never = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"][TableName] extends {
      Update: infer U
    }
    ? U
    : never
  : DefaultSchemaTableNameOrOptions extends keyof DefaultSchema["Tables"]
    ? DefaultSchema["Tables"][DefaultSchemaTableNameOrOptions] extends {
        Update: infer U
      }
      ? U
      : never
    : never

export type Enums<
  DefaultSchemaEnumNameOrOptions extends
    | keyof DefaultSchema["Enums"]
    | { schema: keyof DatabaseWithoutInternals },
  EnumName extends DefaultSchemaEnumNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaEnumNameOrOptions["schema"]]["Enums"]
    : never = never,
> = DefaultSchemaEnumNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[DefaultSchemaEnumNameOrOptions["schema"]]["Enums"][EnumName]
  : DefaultSchemaEnumNameOrOptions extends keyof DefaultSchema["Enums"]
    ? DefaultSchema["Enums"][DefaultSchemaEnumNameOrOptions]
    : never

export type CompositeTypes<
  PublicCompositeTypeNameOrOptions extends
    | keyof DefaultSchema["CompositeTypes"]
    | { schema: keyof DatabaseWithoutInternals },
  CompositeTypeName extends PublicCompositeTypeNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[PublicCompositeTypeNameOrOptions["schema"]]["CompositeTypes"]
    : never = never,
> = PublicCompositeTypeNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[PublicCompositeTypeNameOrOptions["schema"]]["CompositeTypes"][CompositeTypeName]
  : PublicCompositeTypeNameOrOptions extends keyof DefaultSchema["CompositeTypes"]
    ? DefaultSchema["CompositeTypes"][PublicCompositeTypeNameOrOptions]
    : never

export const Constants = {
  public: {
    Enums: {
      app_role: ["admin", "moderator", "user", "super_admin"],
    },
  },
} as const

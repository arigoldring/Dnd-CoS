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
  graphql_public: {
    Tables: {
      [_ in never]: never
    }
    Views: {
      [_ in never]: never
    }
    Functions: {
      graphql: {
        Args: {
          extensions?: Json
          operationName?: string
          query?: string
          variables?: Json
        }
        Returns: Json
      }
    }
    Enums: {
      [_ in never]: never
    }
    CompositeTypes: {
      [_ in never]: never
    }
  }
  public: {
    Tables: {
      campaign_map_reveals: {
        Row: {
          campaign_id: string
          is_revealed: boolean
          map_key: string
        }
        Insert: {
          campaign_id: string
          is_revealed: boolean
          map_key: string
        }
        Update: {
          campaign_id?: string
          is_revealed?: boolean
          map_key?: string
        }
        Relationships: [
          {
            foreignKeyName: "campaign_map_reveals_campaign_id_fkey"
            columns: ["campaign_id"]
            isOneToOne: false
            referencedRelation: "campaigns"
            referencedColumns: ["id"]
          },
        ]
      }
      campaign_members: {
        Row: {
          campaign_id: string
          role: string
          user_id: string
        }
        Insert: {
          campaign_id: string
          role?: string
          user_id: string
        }
        Update: {
          campaign_id?: string
          role?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "campaign_members_campaign_id_fkey"
            columns: ["campaign_id"]
            isOneToOne: false
            referencedRelation: "campaigns"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "campaign_members_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      campaigns: {
        Row: {
          created_at: string
          id: string
          name: string
        }
        Insert: {
          created_at?: string
          id?: string
          name: string
        }
        Update: {
          created_at?: string
          id?: string
          name?: string
        }
        Relationships: []
      }
      character_feats: {
        Row: {
          character_id: string
          created_at: string
          feat_id: string
          id: string
        }
        Insert: {
          character_id: string
          created_at?: string
          feat_id: string
          id?: string
        }
        Update: {
          character_id?: string
          created_at?: string
          feat_id?: string
          id?: string
        }
        Relationships: [
          {
            foreignKeyName: "character_feats_character_id_fkey"
            columns: ["character_id"]
            isOneToOne: false
            referencedRelation: "characters"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "character_feats_feat_id_fkey"
            columns: ["feat_id"]
            isOneToOne: false
            referencedRelation: "feats"
            referencedColumns: ["id"]
          },
        ]
      }
      character_inventory: {
        Row: {
          added_by: string | null
          character_id: string
          created_at: string
          id: string
          item_id: string
          quantity: number
        }
        Insert: {
          added_by?: string | null
          character_id: string
          created_at?: string
          id?: string
          item_id: string
          quantity?: number
        }
        Update: {
          added_by?: string | null
          character_id?: string
          created_at?: string
          id?: string
          item_id?: string
          quantity?: number
        }
        Relationships: [
          {
            foreignKeyName: "character_inventory_added_by_fkey"
            columns: ["added_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "character_inventory_character_id_fkey"
            columns: ["character_id"]
            isOneToOne: false
            referencedRelation: "characters"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "character_inventory_item_id_fkey"
            columns: ["item_id"]
            isOneToOne: false
            referencedRelation: "items"
            referencedColumns: ["id"]
          },
        ]
      }
      character_spells: {
        Row: {
          character_id: string
          created_at: string
          id: string
          spell_id: string
        }
        Insert: {
          character_id: string
          created_at?: string
          id?: string
          spell_id: string
        }
        Update: {
          character_id?: string
          created_at?: string
          id?: string
          spell_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "character_spells_character_id_fkey"
            columns: ["character_id"]
            isOneToOne: false
            referencedRelation: "characters"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "character_spells_spell_id_fkey"
            columns: ["spell_id"]
            isOneToOne: false
            referencedRelation: "spells"
            referencedColumns: ["id"]
          },
        ]
      }
      characters: {
        Row: {
          campaign_id: string
          created_at: string
          id: string
          name: string
          user_id: string
        }
        Insert: {
          campaign_id: string
          created_at?: string
          id?: string
          name: string
          user_id: string
        }
        Update: {
          campaign_id?: string
          created_at?: string
          id?: string
          name?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "characters_campaign_id_user_id_fkey"
            columns: ["campaign_id", "user_id"]
            isOneToOne: true
            referencedRelation: "campaign_members"
            referencedColumns: ["campaign_id", "user_id"]
          },
        ]
      }
      dm_invites: {
        Row: {
          code: string
          created_at: string
          id: string
          label: string | null
          used: boolean
          used_at: string | null
          used_by: string | null
        }
        Insert: {
          code: string
          created_at?: string
          id?: string
          label?: string | null
          used?: boolean
          used_at?: string | null
          used_by?: string | null
        }
        Update: {
          code?: string
          created_at?: string
          id?: string
          label?: string | null
          used?: boolean
          used_at?: string | null
          used_by?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "dm_invites_used_by_fkey"
            columns: ["used_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      feats: {
        Row: {
          benefits: string[]
          campaign_id: string | null
          category: string
          created_at: string
          description: string
          id: string
          name: string
          prerequisite: string | null
          repeatable: boolean
          tags: string[]
        }
        Insert: {
          benefits?: string[]
          campaign_id?: string | null
          category: string
          created_at?: string
          description: string
          id?: string
          name: string
          prerequisite?: string | null
          repeatable?: boolean
          tags?: string[]
        }
        Update: {
          benefits?: string[]
          campaign_id?: string | null
          category?: string
          created_at?: string
          description?: string
          id?: string
          name?: string
          prerequisite?: string | null
          repeatable?: boolean
          tags?: string[]
        }
        Relationships: [
          {
            foreignKeyName: "feats_campaign_id_fkey"
            columns: ["campaign_id"]
            isOneToOne: false
            referencedRelation: "campaigns"
            referencedColumns: ["id"]
          },
        ]
      }
      items: {
        Row: {
          armor_category: string | null
          base_armor_class: number | null
          campaign_id: string | null
          created_at: string | null
          damage_dice: string | null
          damage_type: string | null
          description: string | null
          id: string
          kind: string
          name: string
          price_cp: number
          properties: string[] | null
          range_long: number | null
          range_normal: number | null
          stealth_disadvantage: boolean | null
          strength_requirement: number | null
          tags: string[]
          versatile_dice: string | null
          weapon_category: string | null
        }
        Insert: {
          armor_category?: string | null
          base_armor_class?: number | null
          campaign_id?: string | null
          created_at?: string | null
          damage_dice?: string | null
          damage_type?: string | null
          description?: string | null
          id?: string
          kind?: string
          name: string
          price_cp: number
          properties?: string[] | null
          range_long?: number | null
          range_normal?: number | null
          stealth_disadvantage?: boolean | null
          strength_requirement?: number | null
          tags?: string[]
          versatile_dice?: string | null
          weapon_category?: string | null
        }
        Update: {
          armor_category?: string | null
          base_armor_class?: number | null
          campaign_id?: string | null
          created_at?: string | null
          damage_dice?: string | null
          damage_type?: string | null
          description?: string | null
          id?: string
          kind?: string
          name?: string
          price_cp?: number
          properties?: string[] | null
          range_long?: number | null
          range_normal?: number | null
          stealth_disadvantage?: boolean | null
          strength_requirement?: number | null
          tags?: string[]
          versatile_dice?: string | null
          weapon_category?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "items_campaign_id_fkey"
            columns: ["campaign_id"]
            isOneToOne: false
            referencedRelation: "campaigns"
            referencedColumns: ["id"]
          },
        ]
      }
      location_dm_notes: {
        Row: {
          location_id: string
          notes: string
        }
        Insert: {
          location_id: string
          notes?: string
        }
        Update: {
          location_id?: string
          notes?: string
        }
        Relationships: [
          {
            foreignKeyName: "location_dm_notes_location_id_fkey"
            columns: ["location_id"]
            isOneToOne: true
            referencedRelation: "locations"
            referencedColumns: ["id"]
          },
        ]
      }
      locations: {
        Row: {
          campaign_id: string
          created_at: string
          description: string | null
          id: string
          is_revealed: boolean
          map_key: string
          name: string
          x: number
          y: number
        }
        Insert: {
          campaign_id: string
          created_at?: string
          description?: string | null
          id?: string
          is_revealed?: boolean
          map_key?: string
          name: string
          x: number
          y: number
        }
        Update: {
          campaign_id?: string
          created_at?: string
          description?: string | null
          id?: string
          is_revealed?: boolean
          map_key?: string
          name?: string
          x?: number
          y?: number
        }
        Relationships: [
          {
            foreignKeyName: "locations_campaign_id_fkey"
            columns: ["campaign_id"]
            isOneToOne: false
            referencedRelation: "campaigns"
            referencedColumns: ["id"]
          },
        ]
      }
      npc_dm_notes: {
        Row: {
          notes: string
          npc_id: string
        }
        Insert: {
          notes: string
          npc_id: string
        }
        Update: {
          notes?: string
          npc_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "npc_dm_notes_npc_id_fkey"
            columns: ["npc_id"]
            isOneToOne: true
            referencedRelation: "npcs"
            referencedColumns: ["id"]
          },
        ]
      }
      npcs: {
        Row: {
          campaign_id: string
          created_at: string
          description: string | null
          id: string
          is_revealed: boolean
          location_id: string | null
          name: string
          portrait_key: string | null
        }
        Insert: {
          campaign_id: string
          created_at?: string
          description?: string | null
          id?: string
          is_revealed?: boolean
          location_id?: string | null
          name: string
          portrait_key?: string | null
        }
        Update: {
          campaign_id?: string
          created_at?: string
          description?: string | null
          id?: string
          is_revealed?: boolean
          location_id?: string | null
          name?: string
          portrait_key?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "npcs_campaign_id_fkey"
            columns: ["campaign_id"]
            isOneToOne: false
            referencedRelation: "campaigns"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "npcs_campaign_id_location_id_fkey"
            columns: ["campaign_id", "location_id"]
            isOneToOne: false
            referencedRelation: "locations"
            referencedColumns: ["campaign_id", "id"]
          },
        ]
      }
      party_inventory: {
        Row: {
          added_by: string | null
          campaign_id: string
          created_at: string
          id: string
          item_id: string
          quantity: number
        }
        Insert: {
          added_by?: string | null
          campaign_id: string
          created_at?: string
          id?: string
          item_id: string
          quantity?: number
        }
        Update: {
          added_by?: string | null
          campaign_id?: string
          created_at?: string
          id?: string
          item_id?: string
          quantity?: number
        }
        Relationships: [
          {
            foreignKeyName: "party_inventory_added_by_fkey"
            columns: ["added_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "party_inventory_campaign_id_fkey"
            columns: ["campaign_id"]
            isOneToOne: false
            referencedRelation: "campaigns"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "party_inventory_item_id_fkey"
            columns: ["item_id"]
            isOneToOne: false
            referencedRelation: "items"
            referencedColumns: ["id"]
          },
        ]
      }
      player_invites: {
        Row: {
          campaign_id: string
          code: string
          created_at: string
          id: string
          label: string | null
          used: boolean
          used_at: string | null
          used_by: string | null
        }
        Insert: {
          campaign_id: string
          code: string
          created_at?: string
          id?: string
          label?: string | null
          used?: boolean
          used_at?: string | null
          used_by?: string | null
        }
        Update: {
          campaign_id?: string
          code?: string
          created_at?: string
          id?: string
          label?: string | null
          used?: boolean
          used_at?: string | null
          used_by?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "player_invites_campaign_id_fkey"
            columns: ["campaign_id"]
            isOneToOne: false
            referencedRelation: "campaigns"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "player_invites_used_by_fkey"
            columns: ["used_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      profiles: {
        Row: {
          created_at: string
          display_name: string | null
          id: string
          role: string
        }
        Insert: {
          created_at?: string
          display_name?: string | null
          id: string
          role?: string
        }
        Update: {
          created_at?: string
          display_name?: string | null
          id?: string
          role?: string
        }
        Relationships: []
      }
      schema_migrations: {
        Row: {
          applied_at: string
          version: string
        }
        Insert: {
          applied_at?: string
          version: string
        }
        Update: {
          applied_at?: string
          version?: string
        }
        Relationships: []
      }
      session_recaps: {
        Row: {
          body: string
          campaign_id: string
          created_at: string
          id: string
          last_edited_at: string | null
          last_edited_by: string | null
          session_number: number
          title: string | null
        }
        Insert: {
          body?: string
          campaign_id: string
          created_at?: string
          id?: string
          last_edited_at?: string | null
          last_edited_by?: string | null
          session_number: number
          title?: string | null
        }
        Update: {
          body?: string
          campaign_id?: string
          created_at?: string
          id?: string
          last_edited_at?: string | null
          last_edited_by?: string | null
          session_number?: number
          title?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "session_recaps_campaign_id_fkey"
            columns: ["campaign_id"]
            isOneToOne: false
            referencedRelation: "campaigns"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "session_recaps_last_edited_by_fkey"
            columns: ["last_edited_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      spells: {
        Row: {
          campaign_id: string | null
          casting_time: string
          classes: string[]
          concentration: boolean
          created_at: string
          description: string
          duration: string
          higher_levels: string | null
          id: string
          level: number
          material: boolean
          material_component: string | null
          name: string
          range: string
          ritual: boolean
          school: string
          somatic: boolean
          tags: string[]
          verbal: boolean
        }
        Insert: {
          campaign_id?: string | null
          casting_time: string
          classes?: string[]
          concentration?: boolean
          created_at?: string
          description: string
          duration: string
          higher_levels?: string | null
          id?: string
          level: number
          material?: boolean
          material_component?: string | null
          name: string
          range: string
          ritual?: boolean
          school: string
          somatic?: boolean
          tags?: string[]
          verbal?: boolean
        }
        Update: {
          campaign_id?: string | null
          casting_time?: string
          classes?: string[]
          concentration?: boolean
          created_at?: string
          description?: string
          duration?: string
          higher_levels?: string | null
          id?: string
          level?: number
          material?: boolean
          material_component?: string | null
          name?: string
          range?: string
          ritual?: boolean
          school?: string
          somatic?: boolean
          tags?: string[]
          verbal?: boolean
        }
        Relationships: [
          {
            foreignKeyName: "spells_campaign_id_fkey"
            columns: ["campaign_id"]
            isOneToOne: false
            referencedRelation: "campaigns"
            referencedColumns: ["id"]
          },
        ]
      }
    }
    Views: {
      [_ in never]: never
    }
    Functions: {
      add_character_inventory_item: {
        Args: { target_character: string; target_item: string }
        Returns: string
      }
      add_party_inventory_item: {
        Args: { target_campaign: string; target_item: string }
        Returns: string
      }
      can_edit_character: {
        Args: { target_character: string }
        Returns: boolean
      }
      claim_dm_invite: { Args: { invite_code: string }; Returns: undefined }
      claim_player_invite: { Args: { invite_code: string }; Returns: boolean }
      create_campaign: { Args: { campaign_name: string }; Returns: string }
      decrement_character_inventory_item: {
        Args: { target_entry: string }
        Returns: undefined
      }
      decrement_party_inventory_item: {
        Args: { target_entry: string }
        Returns: undefined
      }
      generate_dm_invite: { Args: { invite_label?: string }; Returns: string }
      generate_player_invite: {
        Args: { invite_label?: string; target_campaign: string }
        Returns: string
      }
      is_campaign_dm: { Args: { target_campaign: string }; Returns: boolean }
      is_campaign_member: {
        Args: { target_campaign: string }
        Returns: boolean
      }
      is_dm: { Args: never; Returns: boolean }
      move_character_item_to_party: {
        Args: { target_entry: string }
        Returns: undefined
      }
      move_party_item_to_character: {
        Args: { target_character: string; target_entry: string }
        Returns: undefined
      }
      set_display_name: {
        Args: { new_display_name: string }
        Returns: undefined
      }
    }
    Enums: {
      [_ in never]: never
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
  graphql_public: {
    Enums: {},
  },
  public: {
    Enums: {},
  },
} as const

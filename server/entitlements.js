// server/entitlements.js

export const PLANS = {
  free: {
    name: "FREE",
    price: "₹0/month",
    limits: {
      calendar_events_per_month: 50,
      ai_commands_per_month: 20,
      ai_daily_plans_per_month: 5,
      ai_replans_per_month: 5,
      ai_weekly_reviews_per_month: 2
    },
    features: {
      google_calendar: true,
      spotify: true,
      gmail: false,
      discord: false,
      instagram: false,
      basic_ai_planning: true,
      advanced_ai_planning: false,
      priority_ai_processing: false
    }
  },
  pro: {
    name: "PRO",
    price: "₹30/month",
    limits: {
      calendar_events_per_month: 300,
      ai_commands_per_month: 300,
      ai_daily_plans_per_month: 30,
      ai_replans_per_month: 30,
      ai_weekly_reviews_per_month: 10
    },
    features: {
      google_calendar: true,
      spotify: true,
      gmail: true,
      discord: false,
      instagram: false,
      basic_ai_planning: true,
      advanced_ai_planning: true,
      priority_ai_processing: false
    }
  },
  pro_plus: {
    name: "PRO PLUS",
    price: "₹50/month",
    limits: {
      calendar_events_per_month: 1000,
      ai_commands_per_month: 1000,
      ai_daily_plans_per_month: 100,
      ai_replans_per_month: 100,
      ai_weekly_reviews_per_month: 30
    },
    features: {
      google_calendar: true,
      spotify: true,
      gmail: true,
      discord: true,
      instagram: false,
      basic_ai_planning: true,
      advanced_ai_planning: true,
      priority_ai_processing: true
    }
  },
  pro_max: {
    name: "PRO MAX",
    price: "₹60/month",
    limits: {
      calendar_events_per_month: -1, // Unlimited
      ai_commands_per_month: 3000,
      ai_daily_plans_per_month: -1,
      ai_replans_per_month: -1,
      ai_weekly_reviews_per_month: -1
    },
    features: {
      google_calendar: true,
      spotify: true,
      gmail: true,
      discord: true,
      instagram: true, // Only if implemented
      basic_ai_planning: true,
      advanced_ai_planning: true,
      priority_ai_processing: true
    }
  }
};

export class EntitlementsService {
  constructor(supabaseClient) {
    this.supabase = supabaseClient;
  }

  async getUserPlan(userId, authClient = null) {
    const client = authClient || this.supabase;
    const { data, error } = await client
      .from('subscriptions')
      .select('plan, status')
      .eq('user_id', userId)
      .single();

    if (error || !data || !data.plan || !PLANS[data.plan]) {
      // Default to free if no subscription record is found or invalid
      return { plan: 'free', details: PLANS['free'] };
    }

    return { plan: data.plan, details: PLANS[data.plan] };
  }

  async checkFeature(userId, featureKey, authClient = null) {
    const { details } = await this.getUserPlan(userId, authClient);
    return details.features[featureKey] === true;
  }

  async getLimit(userId, limitKey) {
    const { details } = await this.getUserPlan(userId);
    return details.limits[limitKey];
  }
}

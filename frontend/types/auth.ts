export interface AuthUser {
  sub:                  string   // user DB id
  email:                string
  username:             string
  name?:                string
  picture?:             string
  onboardingCompleted?: boolean
}

export interface SessionPayload extends AuthUser {
  onboarding_completed?: boolean  // snake_case from backend JWT claim
  iat?: number
  exp?: number
}

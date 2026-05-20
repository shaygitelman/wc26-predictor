export interface AuthUser {
  sub:      string   // Google user ID (becomes our DB primary key)
  email:    string
  username: string
  name?:    string
  picture?: string
}

export interface SessionPayload extends AuthUser {
  iat?: number
  exp?: number
}

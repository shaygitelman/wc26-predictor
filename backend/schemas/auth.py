from pydantic import BaseModel, EmailStr


class GoogleAuthRequest(BaseModel):
    google_id:  str
    email:      EmailStr
    name:       str | None = None
    avatar_url: str | None = None


class UserOut(BaseModel):
    id:         str
    email:      str
    username:   str
    name:       str | None
    avatar_url: str | None

    model_config = {"from_attributes": True}


class AuthResponse(BaseModel):
    user:         UserOut
    access_token: str
    token_type:   str = "bearer"

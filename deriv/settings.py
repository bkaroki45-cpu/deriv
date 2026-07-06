"""
Django settings for deriv project.
"""

from pathlib import Path
import os
from dotenv import load_dotenv

# =========================
# LOAD ENV FIRST
# =========================
load_dotenv()

BASE_DIR = Path(__file__).resolve().parent.parent


def env_bool(name, default=False):
    return os.getenv(name, str(default)).strip().lower() in {"1", "true", "yes", "on"}


def env_list(name, default):
    return [
        value.strip()
        for value in os.getenv(name, default).split(",")
        if value.strip()
    ]


# =========================
# SECURITY
# =========================
SECRET_KEY = os.getenv("DJANGO_SECRET_KEY")
if not SECRET_KEY:
    raise RuntimeError("DJANGO_SECRET_KEY must be set")

DEBUG = env_bool("DEBUG", False)
ALLOWED_HOSTS = env_list(
    "ALLOWED_HOSTS",
    "localhost,127.0.0.1,profiteraa.com,www.profiteraa.com,95.179.193.38",
)
CSRF_TRUSTED_ORIGINS = env_list(
    "CSRF_TRUSTED_ORIGINS",
    "https://profiteraa.com,https://www.profiteraa.com",
)

SECURE_SSL_REDIRECT = env_bool("SECURE_SSL_REDIRECT", not DEBUG)
SESSION_COOKIE_SECURE = env_bool("SESSION_COOKIE_SECURE", not DEBUG)
CSRF_COOKIE_SECURE = env_bool("CSRF_COOKIE_SECURE", not DEBUG)
SECURE_HSTS_SECONDS = int(os.getenv("SECURE_HSTS_SECONDS", "31536000" if not DEBUG else "0"))
SECURE_HSTS_INCLUDE_SUBDOMAINS = env_bool("SECURE_HSTS_INCLUDE_SUBDOMAINS", not DEBUG)
SECURE_HSTS_PRELOAD = env_bool("SECURE_HSTS_PRELOAD", not DEBUG)
SECURE_PROXY_SSL_HEADER = ("HTTP_X_FORWARDED_PROTO", "https")
X_FRAME_OPTIONS = "DENY"


# =========================
# APPLICATIONS
# =========================
INSTALLED_APPS = [
    'django.contrib.admin',
    'django.contrib.auth',
    'django.contrib.contenttypes',
    'django.contrib.sessions',
    'django.contrib.messages',
    'django.contrib.staticfiles',

    # Third party
    'rest_framework',
    'channels',

    # Local apps
    'core',
    'accounts',
    'markets',
    'trading',
    'portfolio',
    'wallet',
    'notifications',
    'api',
]


# =========================
# MIDDLEWARE
# =========================
MIDDLEWARE = [
    'django.middleware.security.SecurityMiddleware',
    'django.contrib.sessions.middleware.SessionMiddleware',
    'django.middleware.common.CommonMiddleware',
    'django.middleware.csrf.CsrfViewMiddleware',
    'django.contrib.auth.middleware.AuthenticationMiddleware',
    'django.contrib.messages.middleware.MessageMiddleware',
    'django.middleware.clickjacking.XFrameOptionsMiddleware',
]


ROOT_URLCONF = 'deriv.urls'


# =========================
# TEMPLATES
# =========================
TEMPLATES = [
    {
        'BACKEND': 'django.template.backends.django.DjangoTemplates',
        'DIRS': [],
        'APP_DIRS': True,
        'OPTIONS': {
            'context_processors': [
                'django.template.context_processors.request',
                'django.contrib.auth.context_processors.auth',
                'django.contrib.messages.context_processors.messages',
            ],
        },
    },
]


WSGI_APPLICATION = 'deriv.wsgi.application'
ASGI_APPLICATION = 'deriv.asgi.application'


# =========================
# CHANNELS (DEV SAFE NOW)
# =========================
CHANNEL_LAYERS = {
    "default": {
        "BACKEND": "channels.layers.InMemoryChannelLayer"
    }
}


# =========================
# DATABASE (DEV)
# =========================
DATABASES = {
    'default': {
        'ENGINE': 'django.db.backends.sqlite3',
        'NAME': BASE_DIR / 'db.sqlite3',
    }
}


# =========================
# PASSWORD VALIDATION
# =========================
AUTH_PASSWORD_VALIDATORS = [
    {'NAME': 'django.contrib.auth.password_validation.UserAttributeSimilarityValidator'},
    {'NAME': 'django.contrib.auth.password_validation.MinimumLengthValidator'},
    {'NAME': 'django.contrib.auth.password_validation.CommonPasswordValidator'},
    {'NAME': 'django.contrib.auth.password_validation.NumericPasswordValidator'},
]


# =========================
# INTERNATIONALIZATION
# =========================
LANGUAGE_CODE = 'en-us'
TIME_ZONE = 'UTC'
USE_I18N = True
USE_TZ = True


# =========================
# STATIC FILES
# =========================
STATIC_URL = os.getenv("STATIC_URL", "/static/")
STATIC_ROOT = os.getenv("STATIC_ROOT", BASE_DIR / "static")


# =========================
# CUSTOM USER MODEL
# =========================
AUTH_USER_MODEL = 'accounts.User'


# =========================
# REST FRAMEWORK (JWT READY)
# =========================
REST_FRAMEWORK = {
    "DEFAULT_AUTHENTICATION_CLASSES": (
        "rest_framework.authentication.SessionAuthentication",
        "rest_framework_simplejwt.authentication.JWTAuthentication",
    ),
    "DEFAULT_PERMISSION_CLASSES": (
        "rest_framework.permissions.IsAuthenticated",
    ),
    "DEFAULT_THROTTLE_CLASSES": (
        "rest_framework.throttling.AnonRateThrottle",
        "rest_framework.throttling.UserRateThrottle",
    ),
    "DEFAULT_THROTTLE_RATES": {
        "anon": os.getenv("DRF_ANON_RATE", "60/min"),
        "user": os.getenv("DRF_USER_RATE", "600/min"),
    },
}


# =========================
# REDIS + CELERY (READY BUT OPTIONAL)
# =========================

REDIS_URL = os.getenv("REDIS_URL", "redis://127.0.0.1:6379/1")


# =========================
# DERIV / PROFITERA
# =========================
DERIV_APP_ID = os.getenv("DERIV_APP_ID", "33vTuukEOhrcxeWfZvhAy")
DERIV_WS_APP_ID = os.getenv("DERIV_WS_APP_ID", "1089")
DERIV_REST_BASE_URL = os.getenv("DERIV_REST_BASE_URL", "https://api.derivws.com")
DERIV_OPTIONS_BASE_URL = os.getenv("DERIV_OPTIONS_BASE_URL", f"{DERIV_REST_BASE_URL}/trading/v1/options")
DERIV_AUTH_BASE_URL = os.getenv("DERIV_AUTH_BASE_URL", "https://auth.deriv.com")
DERIV_OAUTH_SCOPE = os.getenv("DERIV_OAUTH_SCOPE", "trade account_manage")
DERIV_AFFILIATE_TOKEN = os.getenv("DERIV_AFFILIATE_TOKEN", "")
DERIV_UTM_SOURCE = os.getenv("DERIV_UTM_SOURCE", "profiteraa")
DERIV_UTM_CAMPAIGN = os.getenv("DERIV_UTM_CAMPAIGN", "profiteraa_partner")
DERIV_UTM_MEDIUM = os.getenv("DERIV_UTM_MEDIUM", "affiliate")
PROFITERA_MARKUP_PERCENT = os.getenv("PROFITERA_MARKUP_PERCENT", "3")


# ---- CACHE (disabled for now but ready) ----
CACHES = {
    "default": {
        "BACKEND": "django.core.cache.backends.locmem.LocMemCache",
    }
}


# ---- CELERY (ready for activation) ----
CELERY_BROKER_URL = os.getenv("REDIS_URL", "redis://127.0.0.1:6379/0")
CELERY_RESULT_BACKEND = os.getenv("REDIS_URL", "redis://127.0.0.1:6379/0")

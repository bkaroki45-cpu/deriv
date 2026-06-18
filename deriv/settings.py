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


# =========================
# SECURITY
# =========================
SECRET_KEY = 'django-insecure-*y)*9knie71f_yoxb$lr@inwlj$d20n42&&lewhnhr60=goirz'
DEBUG = True
ALLOWED_HOSTS = [
    host.strip()
    for host in os.getenv("ALLOWED_HOSTS", "localhost,127.0.0.1,profiteraa.com,www.profiteraa.com,95.179.193.38").split(",")
    if host.strip()
]


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
DERIV_OAUTH_SCOPE = os.getenv("DERIV_OAUTH_SCOPE", "trade account_manage payments admin")
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

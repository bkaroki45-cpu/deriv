from django.shortcuts import render

# Create your views here.
from django.http import HttpResponse

from django.shortcuts import render

def home(request):
    return render(request, "core/home.html")


def dashboard(request):
    return render(request, "core/dashboard.html")
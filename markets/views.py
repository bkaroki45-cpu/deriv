from django.shortcuts import render

# Create your views here.
from django.shortcuts import render

def chart_page(request):
    return render(request, "markets/chart.html")
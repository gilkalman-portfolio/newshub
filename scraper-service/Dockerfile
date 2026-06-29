FROM pyd4vinci/scrapling:latest

WORKDIR /app

COPY requirements.txt .
RUN pip install --no-cache-dir -r requirements.txt

COPY main.py .

# Railway injects $PORT at runtime; default to 8000 for local use
CMD uvicorn main:app --host 0.0.0.0 --port ${PORT:-8000}

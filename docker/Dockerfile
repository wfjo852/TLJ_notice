FROM python:3.13-slim
WORKDIR /app
COPY backend/requirements.txt backend/requirements.txt
RUN pip install --no-cache-dir -r backend/requirements.txt
COPY --chown=10001:10001 backend ./backend
COPY --chown=10001:10001 frontend ./frontend
USER 10001:10001
EXPOSE 8000
CMD ["python", "backend/app.py"]

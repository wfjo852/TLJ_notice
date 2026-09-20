FROM python:3.13-slim
WORKDIR /app
COPY server.py .
COPY frontend ./frontend
USER 10001:10001
EXPOSE 8000
CMD ["python", "server.py"]

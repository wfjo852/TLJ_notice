#!/bin/sh
cd "$(dirname "$0")" || exit 1
COMPOSE="docker compose -f docker/compose.yaml"

echo "1) 서버 실행"
echo "2) 서버 중지"
read -p "선택: " choice

case "$choice" in
  1)
    $COMPOSE up --build -d
    ;;
  2)
    $COMPOSE down
    ;;
  *)
    echo "1 또는 2를 입력해 주세요."
    exit 1
    ;;
esac

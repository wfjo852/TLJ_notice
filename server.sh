#!/bin/sh
cd "$(dirname "$0")" || exit 1
COMPOSE="docker compose -f docker/compose.yaml"

echo "1) 서버 실행"
echo "2) 서버 중지"
echo "3) 서버 재시작 (backend 코드 반영)"
echo "4) 다시 빌드 후 실행 (requirements.txt 변경 시)"
read -p "선택: " choice

case "$choice" in
  1)
    $COMPOSE up -d
    ;;
  2)
    $COMPOSE down
    ;;
  3)
    $COMPOSE restart web
    ;;
  4)
    $COMPOSE up --build -d
    ;;
  *)
    echo "1~4 중에서 입력해 주세요."
    exit 1
    ;;
esac

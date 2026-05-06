SHELL := /usr/bin/env bash

.PHONY: install dev test lint build verify docker-build docker-up docker-down clean

install:
	npm install

dev:
	npm run dev

test:
	scripts/test.sh

lint:
	npm run lint

build:
	npm run build

verify: test lint build

docker-build:
	docker build -t payment-processing-system:local .

docker-up:
	docker compose up --build

docker-down:
	docker compose down

clean:
	rm -rf dist coverage

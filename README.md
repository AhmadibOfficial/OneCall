
# onecall
## Getting Started

This project is a starting point for a Flutter application.

A few resources to get you started if this is your first Flutter project:

- [Learn Flutter](https://docs.flutter.dev/get-started/learn-flutter)
- [Write your first Flutter app](https://docs.flutter.dev/get-started/codelab)
- [Flutter learning resources](https://docs.flutter.dev/reference/learning-resources)

For help getting started with Flutter development, view the
[online documentation](https://docs.flutter.dev/), which offers tutorials,
samples, guidance on mobile development, and a full API reference.

# OneCall

> **Everything You Need, One Call Away.**

OneCall is a next-generation on-demand services platform designed to connect customers with trusted service providers through a unified digital ecosystem. The platform integrates transportation, home services, professional services, logistics, marketplace capabilities, digital payments, advertising, and analytics into a single scalable platform.

---

# Vision

To become Africa's most trusted platform for connecting people with services while building technology that creates economic opportunities for millions.

---

# Mission

Build a secure, scalable, and intelligent engineering platform that simplifies everyday life by connecting customers, service providers, businesses, and communities through one digital ecosystem.

---

# Engineering Philosophy

At OneCall, software is treated as a long-term business asset.

We build:

* Systems before features
* Platforms before products
* Documentation before assumptions
* Automation before repetition
* Security by design
* Quality by default

Engineering decisions are guided by the **OneCall Git Engineering Standard (OGES)** and supporting architecture documents.

---

# Platform Components

```text
OneCall
│
├── Customer Mobile Application
├── Provider Mobile Application
├── Admin Web Portal
├── Backend Services
├── Platform Services
├── Shared Packages
├── Infrastructure
├── Engineering Documentation
└── Automation
```

---

# Repository Structure

```text
onecall/
│
├── .github/
├── apps/
│   ├── customer_app/
│   ├── provider_app/
│   └── admin_web/
│
├── backend/
├── platform/
├── domains/
├── packages/
├── database/
├── infrastructure/
├── docs/
├── engineering/
├── scripts/
├── tests/
├── tools/
│
├── CHANGELOG.md
├── CONTRIBUTING.md
├── CODE_OF_CONDUCT.md
├── LICENSE
└── README.md
```

---

# Technology Stack

## Frontend

* Flutter
* Dart

## Backend

* NestJS
* TypeScript

## Database

* PostgreSQL
* Redis

## Infrastructure

* Docker
* GitHub Actions
* Oracle Cloud Infrastructure (OCI)

## Architecture

* Domain-Driven Design (DDD)
* Clean Architecture
* Event-Driven Architecture
* REST APIs
* Background Workers
* Modular Monolith (initially), with a path toward microservices where justified

---

# Core Business Domains

* Authentication
* Customer Management
* Provider Management
* Booking Engine
* Wallet
* Payments
* Advertisement
* Notifications
* Analytics
* Administration

---

# Branch Strategy

Permanent branches:

```text
main
develop
```

Capability branches:

```text
capability/authentication
capability/provider
capability/customer
capability/booking
capability/payment
capability/wallet
capability/advertisement
capability/notification
capability/admin
capability/analytics
capability/infrastructure
```

Releases:

```text
release/vX.Y.Z
hotfix/*
```

---

# Development Workflow

```text
Issue
    ↓
Architecture
    ↓
Capability Branch
    ↓
Development
    ↓
Pull Request
    ↓
Code Review
    ↓
Testing
    ↓
Merge into develop
    ↓
Release Branch
    ↓
Production
```

---

# Commit Convention

OneCall follows Conventional Commits.

Examples:

```text
feat(authentication):
feat(booking):
fix(wallet):
perf(search):
security(jwt):
docs(prd):
test(payment):
infra(oracle):
build(ci):
```

---

# Continuous Integration

Every push triggers automated quality checks:

* Checkout
* Dependency Installation
* Static Analysis
* Formatting Validation
* Linting
* Unit Tests
* Integration Tests
* Security Scanning
* Build Verification
* Artifact Generation

A pull request cannot be merged unless all required checks pass.

---

# Engineering Standards

The repository follows internal engineering standards, including:

* OGES – OneCall Git Engineering Standard
* Repository Rules
* Pull Request Standards
* Architecture Decision Records (ADRs)
* Documentation Standards
* Security Standards
* Release Management

---

# Security

Security is part of the engineering process.

The repository includes:

* Dependabot
* Secret Scanning
* Push Protection
* Code Scanning
* Branch Protection Rules
* Mandatory Pull Requests

Please report security vulnerabilities privately through the repository's security reporting process.

---

# Documentation

Project documentation is organized under:

```text
docs/
engineering/
```

These directories contain:

* Product Requirements
* Architecture
* API Documentation
* Engineering Standards
* Design Decisions
* Development Guides
* Operational Runbooks

---

# Contributing

Please read **CONTRIBUTING.md** before opening an issue or submitting a pull request.

All contributions must:

* Follow repository standards
* Pass automated checks
* Include appropriate documentation
* Reference related issues
* Receive required approvals before merging

---

# License

This project is licensed under the terms specified in the **LICENSE** file.

---

# Status

**Current Stage:** Engineering Foundation

The platform is under active development, with core architecture, engineering standards, and foundational services being established.

---

## OneCall

**Everything You Need, One Call Away.**



MIT License


# onecall

A new Flutter project.

## Getting Started

This project is a starting point for a Flutter application.

A few resources to get you started if this is your first Flutter project:

- [Learn Flutter](https://docs.flutter.dev/get-started/learn-flutter)
- [Write your first Flutter app](https://docs.flutter.dev/get-started/codelab)
- [Flutter learning resources](https://docs.flutter.dev/reference/learning-resources)

For help getting started with Flutter development, view the
[online documentation](https://docs.flutter.dev/), which offers tutorials,
samples, guidance on mobile development, and a full API reference.
>>>>>> 85552d0 (Initial project setup for OneCall Super App)
>>>>>>> 9838f8e (Initial project setup for OneCall Super App)

>>>>>>> 8cf351bda566ca81de2aa7af350b74149fc9e819
>>>>>>> 0142318 (refactor(monorepo): migrate project to Turborepo structure)

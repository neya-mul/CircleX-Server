# CircleX Backend 🚀

The secure, scalable, and robust backend API powering the **CircleX** application. Built with Node.js, Express, TypeScript, and features robust token-based authorization.

---

## 🛠️ Tech Stack & Architecture

* **Runtime:** Node.js
* **Framework:** Express.js with TypeScript (`tsx` / `ts-node`)
* **Security & Auth:** JWT (`jose` library) for token verification & middleware route protection
* **Database:** MongoDB / PostgreSQL (Integrated via robust connection pools)

---

## 🔑 Key Security Implementation

The backend follows a strict architecture for securing user routes:
1. **Token Validation:** Uses `jose` (`jwtVerify`) to decrypt and validate incoming `Bearer` tokens.
2. **Context Integrity:** The `verifyToken` middleware extracts user data directly into `req.user`. Internal lookups utilize this trusted server-side identity rather than relying on high-risk, modifiable frontend query parameters (`req.query.email`).

---

## ⚙️ Getting Started

### Prerequisites
* Node.js (v18 or higher recommended)
* npm / yarn / pnpm

### 1. Installation
Clone the repository and install the dependencies:
```bash
cd CircleX-Server
npm install
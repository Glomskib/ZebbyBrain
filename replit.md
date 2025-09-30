# Zebby's World - Health Tracker for EDS and Rare Conditions

## Overview

Zebby's World is a comprehensive health tracking application specifically designed for people with Ehlers-Danlos Syndrome (EDS) and other rare conditions. The platform combines symptom tracking, AI-powered empathetic responses, community features, and a curated product marketplace. Built as a full-stack web application, Zebby aims to provide validation and understanding for users who often feel dismissed by traditional healthcare systems.

## Recent Changes

### September 2025 - Wave 1 Features (AI Trends, Body Parts, Avatar, Shopify) - ✅ UI INTEGRATION COMPLETE
- **AI Research & Trends**: Replaced legacy reflection with AI-powered insights
  - Backend: `server/services/insightStats.ts` aggregates 30d/90d numeric stats (pain avg, flare days, HR, sleep, hydration trends)
  - API: POST `/api/ai/insights` with 24h caching and GPT-4o-mini for non-medical advice
  - UI: `ZebbyFindings.tsx` component displays analysis, trend bullets, and optional action ideas
  - **Integrated**: Mounted on Dashboard below quick stats with 30-day range
  - Feature flag: `FF_AI_TRENDS`
- **Body-Part Specific Tracking**: Enhanced symptom logging with anatomical precision
  - UI: `BodyPartSelector.tsx` with 19 body parts (head, jaw, neck, shoulders, elbows, wrists, back, chest, abdomen, hips, knees, ankles)
  - Side selection for paired parts (left/right/bilateral)
  - Filter component for insights page to view trends by body part
  - Database: `body_part` and `side` columns in `symptom_entries` table
  - **Integrated**: Added to symptom logging form with null-safe type handling for optional body part selection
  - Feature flag: `FF_BODY_PARTS`
- **Zebby Avatar Persistent Chat**: Floating AI companion for on-demand support
  - Backend: POST `/api/ai/chat` with context-aware responses using user stats
  - UI: `ZebbyChat.tsx` as floating chat panel (bottom-right zebra button)
  - GPT-4o-mini with system prompt emphasizing empathy and non-medical advice
  - Rate limited to 10 requests/minute
  - **Integrated**: Mounted globally in App root via AppContent wrapper, only visible when authenticated
  - Feature flag: `FF_AVATAR`
- **Shopify Marketplace Integration**: Read-only product catalog
  - Backend: GraphQL proxy to Shopify Storefront API
  - API: GET `/api/shopify/products` and `/api/shopify/product/:handle`
  - Supports collections, pagination, and product details
  - Environment: `SHOPIFY_STORE_DOMAIN` and `SHOPIFY_STOREFRONT_TOKEN`
  - Feature flag: `FF_SHOPIFY`
- **Database Migration**: SQL-based migration system for Wave 1 schema changes
  - Migration runner: `server/migrations/run-migrations.ts` with ESM support
  - Wave 1 migration: `001_wave1_weather_bodyparts.sql` adds weather and body-part columns
  - Idempotent migrations with `IF NOT EXISTS` clauses

### September 2025 - Personal Circle (Private Health Sharing)
- **Database Schema**: 7 tables for private health data sharing (circles, members, scopes, alert rules, logs, tokens, pending alerts)
- **Backend API (13 endpoints)**: Complete Circle management system
  - Circle auto-creation with default settings (symptoms+vitals shared, summary detail, 30 days back)
  - Member invitations with secure 7-day tokens and email-based invites
  - Member endpoints: accept invite, view owner's health feed, today's snapshot
  - Granular scope controls (shareSymptoms, shareVitals, shareSleep, shareHydration, shareAIReflections)
  - Alert rules configuration (flare threshold, HR delta, low sleep hours, quiet hours, cooldowns)
  - Member management (invite, revoke, update pseudonyms/roles, delete)
- **Manual Reach Out**: POST /api/circles/reach-out to notify selected circle members with optional message
- **Automated Alerts System**: Cron-based alert processor running every 15 minutes
  - Three trigger types: pain flare (intensity ≥ threshold), heart rate variation (POTS), low sleep hours
  - 15-minute cancel window before alerts are sent
  - Quiet hours enforcement (reschedules alerts during quiet period)
  - Cooldown periods (default 180 min between alerts)
  - Channel preferences (email on/off)
- **Frontend UI**: Complete Personal Circle settings page at /circle
  - Member management with invite dialog
  - Privacy scope controls (toggle what data to share)
  - Alert rules configuration (thresholds, quiet hours, channels)
  - Pending alerts view with cancel capability
  - Reach Out button on dashboard for quick support requests
- **Security**: Ownership verification on all operations, Zod validation, isAuthenticated middleware, no-store headers for member data access
- **Privacy-by-Design**: One circle per owner, detail levels (summary/detail), time windows (1-365 days), non-PHI email subjects

### September 2025 - Zebby Social: Group Home Page
- **Group Home Page**: Full-featured group page with feed, post composer, reactions, and member management
- **State-Based Access Control**: Different views for non-members (join prompt), pending members (approval message), and approved members (full access)
- **Post Composer**: Create text posts with real-time validation and success feedback
- **Interactive Feed**: View posts with reactions, comments, polls, and author pseudonyms
- **Pseudonym Editor**: Dialog for members to set/update their privacy-protecting pseudonym
- **Comprehensive Cache Invalidation**: All mutations properly refresh related queries across navigation contexts
- **Content Tabs**: Feed (posts), About (group info), Members (placeholder)
- **Moderator Tools**: Settings access for group owners and moderators

### September 2025 - Zebby Social: Groups Directory MVP
- **Groups Directory Frontend**: Discover page with search, category filtering, and three tabs (Discover/Suggested/Trending)
- **Membership Status Handling**: Proper differentiation between approved/pending/no membership states
- **Smart Group Cards**: Display name, description, member count, category, visibility with appropriate Join/View/Pending buttons
- **Slug-Based Routing**: All navigation uses group slugs (`/groups/{slug}`) matching backend APIs
- **Public Groups API**: GET /api/groups/public with tags array for group discovery
- **My Groups API**: GET /api/groups/my-groups with membership details for user's groups

### September 2025 - EDS-Focused Onboarding System
- **Complete 6-step onboarding flow** for new EDS/rare condition patients
- **Extended user schema** with EDS-specific profile fields (type, diagnosis year, symptoms, goals)
- **Smart routing system** ensuring onboarding completion before dashboard access
- **Enhanced product reviews** with EDS symptom-specific rating scales
- **Robust authentication** with proper database conflict handling and foreign key preservation

## User Preferences

Preferred communication style: Simple, everyday language.

## System Architecture

### Frontend Architecture
- **React with TypeScript**: Modern React application using functional components and hooks
- **Styling**: Tailwind CSS with shadcn/ui component library for consistent design
- **Routing**: Wouter for lightweight client-side routing
- **State Management**: TanStack Query for server state management and caching
- **Build Tool**: Vite for fast development and optimized production builds

### Backend Architecture
- **Express.js Server**: RESTful API with TypeScript
- **Database Layer**: PostgreSQL with Drizzle ORM for type-safe database operations
- **Authentication**: Replit-based OIDC authentication with session management
- **AI Integration**: OpenAI GPT-5 for generating empathetic responses and insights

### Data Storage Solutions
- **Primary Database**: PostgreSQL via Neon serverless
- **Session Storage**: PostgreSQL-backed session store using connect-pg-simple
- **Schema Management**: Drizzle migrations with shared schema definitions

### Key Data Models
- **Users**: Enhanced profile with EDS-specific fields (EDS type, diagnosis year, primary symptoms, experience level, daily goals) and onboarding completion tracking
- **Symptom Logs**: Timestamped symptom entries with AI-generated reflections
- **AI Interactions**: Conversation history and empathetic responses
- **Products**: Marketplace items with categories and user favorites
- **Product Reviews**: EDS-specialized review system with symptom-specific ratings

### Authentication and Authorization
- **OIDC Integration**: Replit-based authentication for secure user login with robust user upsert handling
- **Session Management**: Server-side sessions with PostgreSQL storage
- **Route Protection**: Middleware-based authentication checks on protected endpoints plus smart onboarding flow routing
- **Onboarding Guards**: Automatic routing ensuring new users complete onboarding while preventing completed users from re-accessing setup flow

### Core Features
- **EDS-Focused Onboarding**: Comprehensive 6-step onboarding flow for new users with EDS education, profile personalization, symptom selection, and goal setting
- **Symptom Tracking**: Multi-symptom logging with intensity scales and notes
- **AI Companion**: Zebby the AI companion provides empathetic responses to symptom logs
- **Data Visualization**: Charts showing symptom patterns and trends
- **Marketplace Integration**: Curated products for EDS/rare condition management with specialized review system
- **User Dashboard**: Centralized view of recent activity and AI insights
- **Zebby Social**: Community groups feature with Groups Directory for discovering and joining condition-specific support groups

## External Dependencies

### Database Services
- **Neon PostgreSQL**: Serverless PostgreSQL database hosting
- **Drizzle ORM**: Type-safe database operations and migrations

### AI Services
- **OpenAI GPT-5**: Natural language processing for empathetic responses and personalized insights

### Authentication
- **Replit Auth**: OIDC-based authentication system
- **Express Session**: Session management with PostgreSQL backing

### Frontend Libraries
- **Radix UI**: Accessible component primitives for the design system
- **TanStack Query**: Data fetching and caching layer
- **Date-fns**: Date manipulation utilities
- **Wouter**: Lightweight routing solution

### Development Tools
- **TypeScript**: Type safety across the full stack
- **ESBuild**: Fast bundling for production builds
- **PostCSS**: CSS processing with Tailwind
- **Vite**: Development server and build tool

### UI Components
- **shadcn/ui**: Pre-built accessible components
- **Tailwind CSS**: Utility-first CSS framework
- **Lucide Icons**: Consistent iconography
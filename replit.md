# Zebby - Health Tracker for EDS and Rare Conditions

## Overview

Zebby is a comprehensive health tracking application specifically designed for people with Ehlers-Danlos Syndrome (EDS) and other rare conditions. The platform combines symptom tracking, AI-powered empathetic responses, community features, and a curated product marketplace. Built as a full-stack web application, Zebby aims to provide validation and understanding for users who often feel dismissed by traditional healthcare systems.

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
- **Users**: Profile information and authentication data
- **Symptom Logs**: Timestamped symptom entries with AI-generated reflections
- **AI Interactions**: Conversation history and empathetic responses
- **Products**: Marketplace items with categories and user favorites

### Authentication and Authorization
- **OIDC Integration**: Replit-based authentication for secure user login
- **Session Management**: Server-side sessions with PostgreSQL storage
- **Route Protection**: Middleware-based authentication checks on protected endpoints

### Core Features
- **Symptom Tracking**: Multi-symptom logging with intensity scales and notes
- **AI Companion**: Zebby the AI zebra provides empathetic responses to symptom logs
- **Data Visualization**: Charts showing symptom patterns and trends
- **Marketplace Integration**: Curated products for EDS/rare condition management
- **User Dashboard**: Centralized view of recent activity and AI insights

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
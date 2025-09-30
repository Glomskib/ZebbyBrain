import type { User, Group } from '@shared/schema';

interface AccessCheckResult {
  canAccess: boolean;
  reason?: string;
}

/**
 * Calculate user's current age from birth year
 */
function calculateAge(birthYear: number | null): number | null {
  if (!birthYear) return null;
  const currentYear = new Date().getFullYear();
  return currentYear - birthYear;
}

/**
 * Check if user meets age requirements for a group
 */
function checkAgeAccess(user: User, groupTags: string[]): AccessCheckResult {
  const age = calculateAge(user.birthYear);
  
  // Find age range tags
  const ageTag = groupTags.find(tag => tag.startsWith('age-'));
  
  if (!ageTag) {
    return { canAccess: true }; // No age restriction
  }
  
  if (age === null) {
    return {
      canAccess: false,
      reason: 'Please update your profile with your birth year to access age-restricted groups'
    };
  }
  
  // Parse age range from tag (e.g., "age-18-25", "age-26-35", "age-51-plus")
  if (ageTag === 'age-18-25' && (age < 18 || age > 25)) {
    return { canAccess: false, reason: 'This group is for ages 18-25' };
  }
  if (ageTag === 'age-26-35' && (age < 26 || age > 35)) {
    return { canAccess: false, reason: 'This group is for ages 26-35' };
  }
  if (ageTag === 'age-36-50' && (age < 36 || age > 50)) {
    return { canAccess: false, reason: 'This group is for ages 36-50' };
  }
  if (ageTag === 'age-51-plus' && age < 51) {
    return { canAccess: false, reason: 'This group is for ages 51+' };
  }
  
  return { canAccess: true };
}

/**
 * Check if user meets gender requirements for a group
 */
function checkGenderAccess(user: User, groupTags: string[]): AccessCheckResult {
  const hasWomenTag = groupTags.includes('women');
  const hasMenTag = groupTags.includes('men');
  
  if (!hasWomenTag && !hasMenTag) {
    return { canAccess: true }; // No gender restriction
  }
  
  if (!user.gender) {
    return {
      canAccess: false,
      reason: 'Please update your profile with your gender to access gender-specific groups'
    };
  }
  
  if (hasWomenTag && user.gender !== 'woman') {
    return { canAccess: false, reason: 'This group is for women only' };
  }
  
  if (hasMenTag && user.gender !== 'man') {
    return { canAccess: false, reason: 'This group is for men only' };
  }
  
  return { canAccess: true };
}

/**
 * Check if user meets identity requirements for a group
 */
function checkIdentityAccess(user: User, groupTags: string[]): AccessCheckResult {
  const identityTags = ['lgbtq', 'transgender', 'non-binary', 'queer'];
  const hasIdentityTag = groupTags.some(tag => identityTags.includes(tag.toLowerCase()));
  
  if (!hasIdentityTag) {
    return { canAccess: true }; // No identity restriction
  }
  
  if (!user.identity || user.identity.length === 0) {
    return {
      canAccess: false,
      reason: 'Please update your profile with your identity to access identity-specific groups'
    };
  }
  
  // Check if user's identity matches any of the required tags
  const userIdentityLower = user.identity.map(i => i.toLowerCase());
  const hasMatch = groupTags.some(tag => userIdentityLower.includes(tag.toLowerCase()));
  
  if (!hasMatch) {
    return { canAccess: false, reason: 'This group requires specific identity criteria' };
  }
  
  return { canAccess: true };
}

/**
 * Check if user meets diagnosis requirements for a group
 */
function checkDiagnosisAccess(user: User, groupTags: string[]): AccessCheckResult {
  const diagnosisTags = ['heds', 'pots', 'mcas', 'veds', 'ceds'];
  const hasDiagnosisTag = groupTags.some(tag => diagnosisTags.includes(tag.toLowerCase()));
  
  if (!hasDiagnosisTag) {
    return { canAccess: true }; // No diagnosis restriction
  }
  
  // Check EDS type
  if (user.edsType) {
    const edsTypeLower = user.edsType.toLowerCase();
    if (groupTags.some(tag => tag.toLowerCase() === edsTypeLower || edsTypeLower.includes(tag.toLowerCase()))) {
      return { canAccess: true };
    }
  }
  
  // Check primary symptoms (e.g., user has "POTS" in symptoms for POTS Squad)
  if (user.primarySymptoms && user.primarySymptoms.length > 0) {
    const symptomsLower = user.primarySymptoms.map(s => s.toLowerCase());
    const hasMatch = groupTags.some(tag => 
      symptomsLower.some(symptom => symptom.includes(tag.toLowerCase()))
    );
    
    if (hasMatch) {
      return { canAccess: true };
    }
  }
  
  return {
    canAccess: false,
    reason: 'This group requires specific diagnosis or symptom criteria. Update your profile to include relevant conditions.'
  };
}

/**
 * Main access control check - determines if user can access a group
 */
export function canAccessGroup(user: User, group: Group, groupTags: string[]): AccessCheckResult {
  // Public groups with no specific tags are accessible to all
  if (group.visibility === 'public' && groupTags.length === 0) {
    return { canAccess: true };
  }
  
  // Run all access checks
  const ageCheck = checkAgeAccess(user, groupTags);
  if (!ageCheck.canAccess) return ageCheck;
  
  const genderCheck = checkGenderAccess(user, groupTags);
  if (!genderCheck.canAccess) return genderCheck;
  
  const identityCheck = checkIdentityAccess(user, groupTags);
  if (!identityCheck.canAccess) return identityCheck;
  
  const diagnosisCheck = checkDiagnosisAccess(user, groupTags);
  if (!diagnosisCheck.canAccess) return diagnosisCheck;
  
  return { canAccess: true };
}

import * as Application from 'expo-application';

/**
 * One codebase, three store apps:
 *   ParkPay          com.parkpay.app      drivers (public)
 *   ParkPay Enforce  com.parkpay.enforce  officers (distributed privately to staff)
 *   ParkPay Admin    com.parkpay.admin    operator and platform admins: dashboard, areas (map drawing), people
 * The variant is read from the installed app's own id, which an over-the-air update cannot change.
 * During development EXPO_PUBLIC_APP_VARIANT=officer|admin shows that app inside the dev client.
 */
export const OFFICER_APP_ID = 'com.parkpay.enforce';
export const ADMIN_APP_ID = 'com.parkpay.admin';
const devVariant = process.env.EXPO_PUBLIC_APP_VARIANT;
export const IS_OFFICER_APP = Application.applicationId === OFFICER_APP_ID || devVariant === 'officer';
export const IS_ADMIN_APP = Application.applicationId === ADMIN_APP_ID || devVariant === 'admin';
/** Staff apps skip driver onboarding and need a role before they open. */
export const IS_STAFF_APP = IS_OFFICER_APP || IS_ADMIN_APP;
export const APP_TITLE = IS_ADMIN_APP ? 'ParkPay Admin' : IS_OFFICER_APP ? 'ParkPay Enforce' : 'ParkPay';

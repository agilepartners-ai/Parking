import * as Application from 'expo-application';

/**
 * One codebase, two store apps:
 *   ParkPay          com.parkpay.app      drivers (public)
 *   ParkPay Enforce  com.parkpay.enforce  officers (distributed privately to staff)
 * The variant is read from the installed app's own id, which an over-the-air update cannot change.
 * During development EXPO_PUBLIC_APP_VARIANT=officer shows the officer app inside the dev client.
 */
export const OFFICER_APP_ID = 'com.parkpay.enforce';
export const IS_OFFICER_APP = Application.applicationId === OFFICER_APP_ID || process.env.EXPO_PUBLIC_APP_VARIANT === 'officer';
export const APP_TITLE = IS_OFFICER_APP ? 'ParkPay Enforce' : 'ParkPay';

import { Alert, Platform } from "react-native";
import * as Device from "expo-device";
import * as Notifications from "expo-notifications";
import * as Linking from "expo-linking";
import Constants from "expo-constants";

let activeNotificationThreadId = null;

export function setActiveNotificationThreadId(threadId) {
  activeNotificationThreadId = threadId ? Number(threadId) : null;
}

Notifications.setNotificationHandler({
  handleNotification: async (notification) => {
    const notificationThreadId = Number(notification.request.content.data?.thread_id);

    const isCurrentOpenThread =
      activeNotificationThreadId &&
      notificationThreadId &&
      Number(activeNotificationThreadId) === notificationThreadId;

    return {
      shouldShowBanner: !isCurrentOpenThread,
      shouldShowList: !isCurrentOpenThread,
      shouldPlaySound: !isCurrentOpenThread,
      shouldSetBadge: true,
    };
  },
});

export async function registerForPushNotificationsAsync() {
  if (!Device.isDevice) {
    return {
      token: null,
      error: "Push notifications require a physical device.",
    };
  }

  const existingPermission = await Notifications.getPermissionsAsync();
  let finalStatus = existingPermission.status;

  if (finalStatus !== "granted") {
    const requestedPermission = await Notifications.requestPermissionsAsync();
    finalStatus = requestedPermission.status;
  }

  if (finalStatus !== "granted") {
    return {
      token: null,
      error: "Push notification permission was not granted.",
    };
  }

  const projectId =
    Constants.easConfig?.projectId ||
    Constants.expoConfig?.extra?.eas?.projectId;

  const tokenResponse = await Notifications.getExpoPushTokenAsync(
    projectId ? { projectId } : undefined
  );

  if (Platform.OS === "android") {
    await Notifications.setNotificationChannelAsync("default", {
      name: "default",
      importance: Notifications.AndroidImportance.MAX,
    });
  }

  return {
    token: tokenResponse.data,
    error: null,
    platform: Platform.OS,
    deviceName: Device.deviceName || Device.modelName || null,
  };
}

function getNotificationData(response) {
  return response?.notification?.request?.content?.data || {};
}

function getThreadIdFromNotificationResponse(response) {
  const data = getNotificationData(response);
  const threadId = data.thread_id || data.threadId;

  return threadId ? Number(threadId) : null;
}

function getUrlFromNotificationResponse(response) {
  const data = getNotificationData(response);

  return data.document_url || data.documentUrl || data.url || null;
}

async function openNotificationUrl(response) {
  const url = getUrlFromNotificationResponse(response);

  if (!url) {
    return false;
  }

  try {
    const canOpen = await Linking.canOpenURL(url);

    if (!canOpen) {
      Alert.alert(
        "Unable to open document",
        "Please check your email or contact your manager."
      );
      return true;
    }

    await Linking.openURL(url);
    return true;
  } catch (error) {
    console.warn("Unable to open notification URL", error);
    Alert.alert(
      "Unable to open document",
      "Please check your email or contact your manager."
    );
    return true;
  }
}

export function addNotificationResponseListener(callback) {
  return Notifications.addNotificationResponseReceivedListener(async (response) => {
    const openedUrl = await openNotificationUrl(response);

    if (openedUrl) {
      return;
    }

    const threadId = getThreadIdFromNotificationResponse(response);

    if (threadId) {
      callback({ threadId, response });
    }
  });
}

export async function getLastNotificationThreadIdAsync() {
  const response = await Notifications.getLastNotificationResponseAsync();

  const openedUrl = await openNotificationUrl(response);

  if (openedUrl) {
    return null;
  }

  return getThreadIdFromNotificationResponse(response);
}

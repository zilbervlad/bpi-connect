import { useMemo, useRef } from "react";
import {
  Animated,
  Dimensions,
  Modal,
  PanResponder,
  Pressable,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from "react-native";

const { width: SCREEN_WIDTH, height: SCREEN_HEIGHT } = Dimensions.get("window");

const MIN_SCALE = 1;
const MAX_SCALE = 5;
const DOUBLE_TAP_DELAY = 280;

function getTouchDistance(touches = []) {
  if (touches.length < 2) return 0;

  const [first, second] = touches;

  return Math.hypot(
    second.pageX - first.pageX,
    second.pageY - first.pageY
  );
}

export function ZoomableImageModal({ visible, imageUri, onClose }) {
  const scale = useRef(new Animated.Value(1)).current;
  const translateX = useRef(new Animated.Value(0)).current;
  const translateY = useRef(new Animated.Value(0)).current;

  const currentScaleRef = useRef(1);
  const currentXRef = useRef(0);
  const currentYRef = useRef(0);

  const gestureStartScaleRef = useRef(1);
  const gestureStartXRef = useRef(0);
  const gestureStartYRef = useRef(0);
  const pinchStartDistanceRef = useRef(0);
  const lastTapRef = useRef(0);

  function updateScale(nextScale) {
    const boundedScale = Math.max(
      MIN_SCALE,
      Math.min(MAX_SCALE, nextScale)
    );

    currentScaleRef.current = boundedScale;
    scale.setValue(boundedScale);

    if (boundedScale <= MIN_SCALE) {
      currentXRef.current = 0;
      currentYRef.current = 0;
      translateX.setValue(0);
      translateY.setValue(0);
    }
  }

  function resetImage(animated = true) {
    currentScaleRef.current = 1;
    currentXRef.current = 0;
    currentYRef.current = 0;

    if (!animated) {
      scale.setValue(1);
      translateX.setValue(0);
      translateY.setValue(0);
      return;
    }

    Animated.parallel([
      Animated.spring(scale, {
        toValue: 1,
        useNativeDriver: true,
        friction: 8,
        tension: 80,
      }),
      Animated.spring(translateX, {
        toValue: 0,
        useNativeDriver: true,
        friction: 8,
        tension: 80,
      }),
      Animated.spring(translateY, {
        toValue: 0,
        useNativeDriver: true,
        friction: 8,
        tension: 80,
      }),
    ]).start();
  }

  function handleClose() {
    resetImage(false);
    onClose?.();
  }

  function handleDoubleTap() {
    const nextScale = currentScaleRef.current > 1 ? 1 : 2.5;

    currentScaleRef.current = nextScale;

    if (nextScale === 1) {
      currentXRef.current = 0;
      currentYRef.current = 0;
    }

    Animated.parallel([
      Animated.spring(scale, {
        toValue: nextScale,
        useNativeDriver: true,
        friction: 8,
        tension: 80,
      }),
      Animated.spring(translateX, {
        toValue: nextScale === 1 ? 0 : currentXRef.current,
        useNativeDriver: true,
        friction: 8,
        tension: 80,
      }),
      Animated.spring(translateY, {
        toValue: nextScale === 1 ? 0 : currentYRef.current,
        useNativeDriver: true,
        friction: 8,
        tension: 80,
      }),
    ]).start();
  }

  const panResponder = useMemo(
    () =>
      PanResponder.create({
        onStartShouldSetPanResponder: () => true,
        onMoveShouldSetPanResponder: (_, gestureState) =>
          Math.abs(gestureState.dx) > 2 ||
          Math.abs(gestureState.dy) > 2,

        onPanResponderGrant: (event) => {
          const touches = event.nativeEvent.touches || [];

          gestureStartScaleRef.current = currentScaleRef.current;
          gestureStartXRef.current = currentXRef.current;
          gestureStartYRef.current = currentYRef.current;

          if (touches.length >= 2) {
            pinchStartDistanceRef.current = getTouchDistance(touches);
            return;
          }

          const now = Date.now();

          if (now - lastTapRef.current < DOUBLE_TAP_DELAY) {
            lastTapRef.current = 0;
            handleDoubleTap();
          } else {
            lastTapRef.current = now;
          }
        },

        onPanResponderMove: (event, gestureState) => {
          const touches = event.nativeEvent.touches || [];

          if (touches.length >= 2) {
            const currentDistance = getTouchDistance(touches);

            if (
              pinchStartDistanceRef.current > 0 &&
              currentDistance > 0
            ) {
              const pinchRatio =
                currentDistance / pinchStartDistanceRef.current;

              updateScale(
                gestureStartScaleRef.current * pinchRatio
              );
            }

            return;
          }

          if (currentScaleRef.current <= 1) return;

          const nextX = gestureStartXRef.current + gestureState.dx;
          const nextY = gestureStartYRef.current + gestureState.dy;

          currentXRef.current = nextX;
          currentYRef.current = nextY;

          translateX.setValue(nextX);
          translateY.setValue(nextY);
        },

        onPanResponderRelease: () => {
          pinchStartDistanceRef.current = 0;

          if (currentScaleRef.current < 1.05) {
            resetImage();
          }
        },

        onPanResponderTerminate: () => {
          pinchStartDistanceRef.current = 0;
        },
      }),
    []
  );

  return (
    <Modal
      visible={visible}
      transparent
      animationType="fade"
      statusBarTranslucent
      onRequestClose={handleClose}
    >
      <View style={viewerStyles.backdrop}>
        <Pressable style={StyleSheet.absoluteFill} onPress={handleClose} />

        <View
          style={viewerStyles.gestureArea}
          {...panResponder.panHandlers}
        >
          {imageUri ? (
            <Animated.Image
              source={{ uri: imageUri }}
              resizeMode="contain"
              style={[
                viewerStyles.image,
                {
                  transform: [
                    { translateX },
                    { translateY },
                    { scale },
                  ],
                },
              ]}
            />
          ) : null}
        </View>

        <TouchableOpacity
          style={viewerStyles.closeButton}
          onPress={handleClose}
          activeOpacity={0.8}
        >
          <Text style={viewerStyles.closeText}>×</Text>
        </TouchableOpacity>

        <View pointerEvents="none" style={viewerStyles.helpBadge}>
          <Text style={viewerStyles.helpText}>
            Pinch to zoom · Drag to move · Double-tap
          </Text>
        </View>
      </View>
    </Modal>
  );
}

const viewerStyles = StyleSheet.create({
  backdrop: {
    flex: 1,
    backgroundColor: "rgba(0,0,0,0.97)",
    alignItems: "center",
    justifyContent: "center",
  },
  gestureArea: {
    width: SCREEN_WIDTH,
    height: SCREEN_HEIGHT,
    alignItems: "center",
    justifyContent: "center",
    overflow: "hidden",
  },
  image: {
    width: SCREEN_WIDTH,
    height: SCREEN_HEIGHT * 0.88,
  },
  closeButton: {
    position: "absolute",
    top: 54,
    right: 18,
    width: 44,
    height: 44,
    borderRadius: 22,
    backgroundColor: "rgba(30,30,30,0.85)",
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.28)",
    alignItems: "center",
    justifyContent: "center",
    zIndex: 10,
  },
  closeText: {
    color: "#ffffff",
    fontSize: 32,
    lineHeight: 34,
    fontWeight: "300",
  },
  helpBadge: {
    position: "absolute",
    bottom: 42,
    alignSelf: "center",
    paddingHorizontal: 14,
    paddingVertical: 8,
    borderRadius: 999,
    backgroundColor: "rgba(30,30,30,0.78)",
  },
  helpText: {
    color: "#ffffff",
    fontSize: 12,
    fontWeight: "700",
  },
});

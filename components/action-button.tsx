import { Pressable, StyleSheet, Text } from 'react-native';

import { AppColors, AppRadius, AppSpacing } from '@/constants/app-theme';

type ActionButtonProps = {
  label: string;
  onPress: () => void;
  variant?: 'primary' | 'secondary' | 'ghost';
  disabled?: boolean;
};

export function ActionButton({
  label,
  onPress,
  variant = 'primary',
  disabled = false,
}: ActionButtonProps) {
  return (
    <Pressable
      accessibilityRole="button"
      disabled={disabled}
      onPress={onPress}
      style={({ pressed }) => [
        styles.base,
        styles[variant],
        pressed && !disabled ? styles.pressed : null,
        disabled ? styles.disabled : null,
      ]}>
      <Text style={[styles.label, variant === 'ghost' ? styles.ghostLabel : null]}>{label}</Text>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  base: {
    alignItems: 'center',
    borderRadius: AppRadius.md,
    minHeight: 54,
    justifyContent: 'center',
    paddingHorizontal: AppSpacing.lg,
  },
  primary: {
    backgroundColor: AppColors.accent,
  },
  secondary: {
    backgroundColor: AppColors.secondary,
    borderWidth: 1,
    borderColor: AppColors.border,
  },
  ghost: {
    backgroundColor: 'transparent',
    borderWidth: 1,
    borderColor: AppColors.border,
  },
  pressed: {
    opacity: 0.9,
    transform: [{ scale: 0.98 }],
  },
  disabled: {
    opacity: 0.45,
  },
  label: {
    color: AppColors.text,
    fontSize: 16,
    fontWeight: '700',
  },
  ghostLabel: {
    color: AppColors.mutedText,
  },
});
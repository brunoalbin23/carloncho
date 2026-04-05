import type { PropsWithChildren } from 'react';

import { ScrollView, StyleSheet, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { AppColors, AppSpacing } from '@/constants/app-theme';

type ScreenShellProps = PropsWithChildren<{
  title: string;
  subtitle: string;
}>;

export function ScreenShell({ children, title, subtitle }: ScreenShellProps) {
  return (
    <SafeAreaView edges={["top", "left", "right"]} style={styles.safeArea}>
      <ScrollView contentContainerStyle={styles.content} showsVerticalScrollIndicator={false}>
        <View style={styles.header}>
          <Text style={styles.eyebrow}>CARLONCHO</Text>
          <Text style={styles.title}>{title}</Text>
          <Text style={styles.subtitle}>{subtitle}</Text>
        </View>
        {children}
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safeArea: {
    flex: 1,
    backgroundColor: AppColors.background,
  },
  content: {
    padding: AppSpacing.lg,
    paddingBottom: AppSpacing.xxl,
    gap: AppSpacing.lg,
  },
  header: {
    gap: AppSpacing.xs,
    marginBottom: AppSpacing.sm,
  },
  eyebrow: {
    color: AppColors.accent,
    fontSize: 12,
    fontWeight: '800',
    letterSpacing: 2,
  },
  title: {
    color: AppColors.text,
    fontSize: 34,
    fontWeight: '800',
  },
  subtitle: {
    color: AppColors.mutedText,
    fontSize: 16,
    lineHeight: 23,
  },
});
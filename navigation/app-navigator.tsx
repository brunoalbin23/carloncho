import { DefaultTheme, NavigationContainer } from '@react-navigation/native';
import { createNativeStackNavigator } from '@react-navigation/native-stack';

import { AppColors } from '@/constants/app-theme';
import { EndScreen } from '@/screens/EndScreen';
import { GameScreen } from '@/screens/GameScreen';
import { HomeScreen } from '@/screens/HomeScreen';
import { LobbyScreen } from '@/screens/LobbyScreen';
import { ResultScreen } from '@/screens/ResultScreen';
import type { RootStackParamList } from '@/types/navigation';

const Stack = createNativeStackNavigator<RootStackParamList>();

const navigationTheme = {
  ...DefaultTheme,
  colors: {
    ...DefaultTheme.colors,
    background: AppColors.background,
    card: AppColors.secondary,
    border: AppColors.border,
    primary: AppColors.accent,
    text: AppColors.text,
  },
};

export function AppNavigator() {
  return (
    <NavigationContainer theme={navigationTheme}>
      <Stack.Navigator
        initialRouteName="Home"
        screenOptions={{
          headerBackTitleVisible: false,
          headerShadowVisible: false,
          headerStyle: {
            backgroundColor: AppColors.background,
          },
          headerTintColor: AppColors.text,
          headerTitleStyle: {
            fontSize: 18,
            fontWeight: '700',
          },
          contentStyle: {
            backgroundColor: AppColors.background,
          },
        }}>
        <Stack.Screen name="Home" component={HomeScreen} options={{ headerShown: false }} />
        <Stack.Screen name="Lobby" component={LobbyScreen} options={{ title: 'Sala' }} />
        <Stack.Screen
          name="Game"
          component={GameScreen}
          options={{ title: 'Mesa', gestureEnabled: false }}
        />
        <Stack.Screen name="Result" component={ResultScreen} options={{ title: 'Resultado' }} />
        <Stack.Screen
          name="End"
          component={EndScreen}
          options={{ title: 'Fin de partida', gestureEnabled: false }}
        />
      </Stack.Navigator>
    </NavigationContainer>
  );
}
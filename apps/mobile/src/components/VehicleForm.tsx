import { Ionicons } from '@expo/vector-icons';
import React from 'react';
import { Pressable, Text, View } from 'react-native';
import type { NewVehicle, SizeClass } from '@parkpay/shared';
import { radius, space, useTheme } from '../theme';
import { Chip, Field, Label, Row } from './ui';

export interface VehicleDraft {
  plate: string;
  region: string;
  nickname: string;
  make: string;
  model: string;
  colour: string;
  size_class: SizeClass;
}

export const emptyVehicle = (): VehicleDraft => ({ plate: '', region: 'ON', nickname: '', make: '', model: '', colour: '', size_class: 'standard' });

export const vehicleValid = (v: VehicleDraft) => v.plate.replace(/[^a-z0-9]/gi, '').length >= 2;

export const toNewVehicle = (v: VehicleDraft): NewVehicle => ({
  plate: v.plate,
  region: v.region,
  nickname: v.nickname || [v.colour, v.make].filter(Boolean).join(' ') || undefined,
  make: v.make || undefined,
  model: v.model || undefined,
  colour: v.colour || undefined,
  size_class: v.size_class,
});

const COLOURS = ['White', 'Black', 'Silver', 'Grey', 'Blue', 'Red', 'Green', 'Other'];
const SIZES: { id: SizeClass; title: string; hint: string; icon: keyof typeof Ionicons.glyphMap }[] = [
  { id: 'compact', title: 'Compact', hint: 'Hatchback, small car', icon: 'car-outline' },
  { id: 'standard', title: 'Standard', hint: 'Sedan, small SUV', icon: 'car' },
  { id: 'large', title: 'Large', hint: 'Van, truck, big SUV', icon: 'bus-outline' },
];

/** The vehicle questions, asked once at sign-up and reused on the Vehicles tab. */
export default function VehicleForm({ value, onChange, error }: { value: VehicleDraft; onChange: (v: VehicleDraft) => void; error?: string | null }) {
  const t = useTheme();
  const set = <K extends keyof VehicleDraft>(k: K, x: VehicleDraft[K]) => onChange({ ...value, [k]: x });
  return (
    <View style={{ gap: space.md }}>
      <View style={{ flexDirection: 'row', gap: 12 }}>
        <View style={{ flex: 1 }}>
          <Field label="Licence plate" value={value.plate} onChangeText={(x) => set('plate', x.toUpperCase())} placeholder="ABCD 123" autoCapitalize="characters" autoCorrect={false} error={error} />
        </View>
        <View style={{ width: 92 }}>
          <Field label="Region" value={value.region} onChangeText={(x) => set('region', x.toUpperCase())} placeholder="ON" autoCapitalize="characters" maxLength={3} />
        </View>
      </View>
      <View style={{ flexDirection: 'row', gap: 12 }}>
        <View style={{ flex: 1 }}><Field label="Make" value={value.make} onChangeText={(x) => set('make', x)} placeholder="Toyota" autoCapitalize="words" /></View>
        <View style={{ flex: 1 }}><Field label="Model" value={value.model} onChangeText={(x) => set('model', x)} placeholder="Corolla" autoCapitalize="words" /></View>
      </View>
      <View style={{ gap: 6 }}>
        <Label>Colour</Label>
        <Row style={{ flexWrap: 'wrap' }}>
          {COLOURS.map((c) => (
            <Chip key={c} text={c} active={value.colour === c} onPress={() => set('colour', value.colour === c ? '' : c)} />
          ))}
        </Row>
      </View>
      <View style={{ gap: 6 }}>
        <Label>Size</Label>
        <View style={{ flexDirection: 'row', gap: 8 }}>
          {SIZES.map((s) => {
            const on = value.size_class === s.id;
            return (
              <Pressable
                key={s.id}
                accessibilityRole="radio"
                accessibilityState={{ selected: on }}
                accessibilityLabel={`${s.title}: ${s.hint}`}
                onPress={() => set('size_class', s.id)}
                style={({ pressed }) => ({ flex: 1, alignItems: 'center', gap: 4, paddingVertical: 12, paddingHorizontal: 6, borderRadius: radius.button, borderWidth: 1.5, borderColor: on ? t.brand : t.border, backgroundColor: on ? t.brandSoft : t.card, transform: [{ scale: pressed ? 0.97 : 1 }] })}
              >
                <Ionicons name={s.icon} size={24} color={on ? t.brand : t.muted} />
                <Text style={{ color: t.text, fontWeight: '700', fontSize: 14 }}>{s.title}</Text>
                <Text style={{ color: t.muted, fontSize: 11, textAlign: 'center' }} numberOfLines={2}>{s.hint}</Text>
              </Pressable>
            );
          })}
        </View>
      </View>
    </View>
  );
}

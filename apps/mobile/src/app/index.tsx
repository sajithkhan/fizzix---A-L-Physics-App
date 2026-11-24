import { Redirect } from 'expo-router';
import { useLocaleState } from '@/features/language/locale-context';

/** Entry: first launch goes to the language screen (ST-01); afterwards straight on. */
export default function Index() {
  const { saved } = useLocaleState();
  return <Redirect href={saved ? '/welcome' : '/language'} />;
}

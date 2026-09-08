import { useState } from 'react';

export default function useMobileEdit() {
  const [mobileEditingTask, setMobileEditingTask] = useState(null);
  const [mobileEditIsInbox, setMobileEditIsInbox] = useState(false);

  return {
    mobileEditingTask,
    setMobileEditingTask,
    mobileEditIsInbox,
    setMobileEditIsInbox,
  };
}

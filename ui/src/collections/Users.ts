import type { Access, CollectionConfig, FieldAccess } from 'payload'

const isAdminRequest = (req: Parameters<Access>[0]['req']) => req.user?.collection === 'admins'
const isServerManagedField: FieldAccess = ({ req }) =>
  req.user?.collection === 'admins' || req.context.allowFluxOnboardingUpdate === true
const isSelfOrAdmin: Access = ({ req }) => {
  if (isAdminRequest(req)) return true
  if (req.user?.collection === 'users') return { id: { equals: req.user.id } }
  return false
}

export const Users: CollectionConfig = {
  slug: 'users',
  auth: true,
  admin: {
    hidden: true,
    useAsTitle: 'email',
  },
  access: {
    create: () => true,
    delete: ({ req }) => isAdminRequest(req),
    read: isSelfOrAdmin,
    update: isSelfOrAdmin,
  },
  fields: [
    {
      name: 'fullName',
      type: 'text',
      required: true,
      maxLength: 120,
    },
    {
      name: 'onboardingStep',
      type: 'select',
      required: true,
      defaultValue: 'overview',
      access: {
        create: isServerManagedField,
        update: isServerManagedField,
      },
      options: [
        { label: 'Financial overview', value: 'overview' },
        { label: 'Understanding preference', value: 'understanding' },
        { label: 'Goal', value: 'goal' },
        { label: 'Personalized insight', value: 'insight' },
        { label: 'Complete', value: 'complete' },
      ],
    },
  ],
  versions: false,
}

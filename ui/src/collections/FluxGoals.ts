import type { Access, CollectionConfig } from 'payload'

const isAdmin: Access = ({ req }) => req.user?.collection === 'admins'

export const FluxGoals: CollectionConfig = {
  slug: 'flux-goals',
  admin: {
    group: 'Flux',
    useAsTitle: 'label',
    defaultColumns: ['label', 'goalKey', 'targetAmount', 'timeline'],
  },
  access: {
    create: isAdmin,
    delete: isAdmin,
    read: () => true,
    update: isAdmin,
  },
  versions: false,
  fields: [
    {
      name: 'label',
      type: 'text',
      required: true,
    },
    {
      name: 'goalKey',
      type: 'text',
      required: true,
      unique: true,
      index: true,
      admin: { position: 'sidebar' },
    },
    {
      name: 'targetAmount',
      type: 'number',
      min: 0,
    },
    {
      name: 'timeline',
      type: 'text',
    },
    {
      name: 'sortOrder',
      type: 'number',
      defaultValue: 0,
      admin: { position: 'sidebar' },
    },
  ],
}

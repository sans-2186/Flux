import type { Access, CollectionConfig, FieldAccess, Where } from 'payload'

const isAdminField: FieldAccess = ({ req }) => req.user?.collection === 'admins'
const isAdminRequest = (req: Parameters<Access>[0]['req']) => req.user?.collection === 'admins'
const isAppUserRequest = (req: Parameters<Access>[0]['req']) => req.user?.collection === 'users'

export const FluxProfiles: CollectionConfig = {
  slug: 'flux-profiles',
  admin: {
    group: 'Flux',
    useAsTitle: 'name',
    defaultColumns: ['name', 'goal', 'timeline', 'updatedAt'],
  },
  access: {
    create: ({ req }) => isAdminRequest(req) || isAppUserRequest(req),
    delete: ({ req }) =>
      isAdminRequest(req) ||
      (req.user?.collection === 'users' ? ({ owner: { equals: req.user.id } } as Where) : false),
    read: ({ req }) => {
      if (isAdminRequest(req)) return true
      if (req.user?.collection === 'users') return { owner: { equals: req.user.id } } as Where
      if (req.context.allowFluxDemoAccess === true) return { isDemo: { equals: true } } as Where
      return false
    },
    update: ({ req }) => {
      if (isAdminRequest(req)) return true
      if (req.user?.collection === 'users') return { owner: { equals: req.user.id } } as Where
      if (req.context.allowFluxDemoAccess === true) return { isDemo: { equals: true } } as Where
      return false
    },
  },
  versions: false,
  hooks: {
    beforeValidate: [
      ({ data, operation, req }) => {
        if (operation === 'create' && req.user?.collection === 'users') {
          return {
            ...data,
            owner: req.user.id,
            profileKey: `user-${req.user.id}`,
            isDemo: false,
          }
        }
        return data
      },
    ],
  },
  fields: [
    {
      name: 'owner',
      type: 'relationship',
      relationTo: 'users',
      index: true,
      admin: { position: 'sidebar' },
      access: {
        create: isAdminField,
        update: isAdminField,
      },
    },
    {
      name: 'name',
      type: 'text',
      required: true,
    },
    {
      name: 'profileKey',
      type: 'text',
      required: true,
      unique: true,
      index: true,
      admin: { position: 'sidebar' },
      access: {
        create: isAdminField,
        update: isAdminField,
      },
    },
    {
      name: 'isDemo',
      type: 'checkbox',
      defaultValue: false,
      admin: { position: 'sidebar' },
      access: {
        create: isAdminField,
        update: isAdminField,
      },
    },
    {
      name: 'income',
      label: 'Monthly take-home income',
      type: 'number',
      min: 0,
      required: true,
    },
    {
      name: 'housing',
      label: 'Monthly housing costs',
      type: 'number',
      min: 0,
      required: true,
    },
    {
      name: 'expenses',
      label: 'Other monthly expenses (excluding debt)',
      type: 'number',
      min: 0,
      required: true,
    },
    {
      name: 'savings',
      label: 'Current savings',
      type: 'number',
      min: 0,
      required: true,
    },
    {
      name: 'debt',
      label: 'Existing monthly debt payments',
      type: 'number',
      min: 0,
      required: true,
    },
    {
      name: 'goal',
      type: 'text',
    },
    {
      name: 'goals',
      type: 'array',
      fields: [{ name: 'label', type: 'text', required: true, maxLength: 160 }],
    },
    {
      name: 'understandingFocus',
      label: 'What the user wants to understand first',
      type: 'select',
      options: [
        { label: 'Where my money goes', value: 'money-flow' },
        { label: 'What I can afford', value: 'affordability' },
        { label: 'How to save more', value: 'saving' },
        { label: 'How debt affects me', value: 'debt' },
        { label: 'Just show me the big picture', value: 'big-picture' },
      ],
    },
    {
      name: 'understandingFocuses',
      label: 'What the user wants to understand',
      type: 'select',
      hasMany: true,
      options: [
        { label: 'Where my money goes', value: 'money-flow' },
        { label: 'What I can afford', value: 'affordability' },
        { label: 'How to save more', value: 'saving' },
        { label: 'How debt affects me', value: 'debt' },
        { label: 'Just show me the big picture', value: 'big-picture' },
      ],
    },
    {
      name: 'timeline',
      type: 'text',
      required: true,
    },
    {
      name: 'motivation',
      type: 'textarea',
    },
    {
      name: 'concern',
      type: 'text',
    },
    {
      name: 'guidance',
      type: 'text',
    },
    {
      name: 'accounts',
      type: 'array',
      fields: [
        { name: 'accountKey', type: 'text', required: true },
        { name: 'name', type: 'text', required: true },
        {
          name: 'type',
          type: 'select',
          required: true,
          options: [
            { label: 'Checking', value: 'checking' },
            { label: 'Savings', value: 'savings' },
            { label: 'Credit card', value: 'credit-card' },
            { label: 'Loan', value: 'loan' },
            { label: 'Investment', value: 'investment' },
          ],
        },
        { name: 'balance', type: 'number', required: true },
        { name: 'monthlyPayment', type: 'number', min: 0 },
      ],
    },
    {
      name: 'obligations',
      type: 'array',
      fields: [
        { name: 'obligationKey', type: 'text', required: true },
        { name: 'name', type: 'text', required: true },
        { name: 'amount', type: 'number', min: 0, required: true },
        { name: 'dueInDays', type: 'number', min: 0, required: true },
      ],
    },
  ],
}

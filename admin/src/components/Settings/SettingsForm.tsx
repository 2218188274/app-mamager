import { useEffect } from 'react'
import { Form, Card, Button, Row, Col, Tabs } from 'antd'
import { ToggleField } from './ToggleField'
import { SelectField } from './SelectField'
import { InputField } from './InputField'
import { CustomField } from './CustomField'
import type { SettingsFormProps, SettingsSection, SettingsItem } from './types'

export function SettingsForm({
  config,
  values = {},
  loading = false,
  saving = false,
  onChange,
  onSave,
}: SettingsFormProps) {
  const [form] = Form.useForm()

  // 同步外部值到表单
  useEffect(() => {
    if (Object.keys(values).length > 0) {
      form.setFieldsValue(values)
    }
  }, [values, form])

  // 值变化时通知外部
  const handleValuesChange = (_changedValues: Record<string, any>, allValues: Record<string, any>) => {
    onChange?.(allValues)
  }

  // 保存
  const handleSave = async () => {
    try {
      const values = await form.validateFields()
      onSave?.(values)
    } catch (error) {
      console.error('Validation failed:', error)
    }
  }

  // 渲染单个设置项
  const renderSettingItem = (item: SettingsItem) => {
    const commonProps = {
      ...item,
      value: values[item.key],
    }

    switch (item.type) {
      case 'toggle':
        return <ToggleField {...commonProps} />
      case 'select':
        return <SelectField {...commonProps} />
      case 'number':
        return <InputField {...commonProps} />
      case 'text':
      case 'textarea':
        return <InputField {...commonProps} />
      case 'custom':
        return <CustomField {...commonProps} />
      default:
        return <InputField {...commonProps} />
    }
  }

  // 渲染设置分区
  const renderSection = (section: SettingsSection, index: number) => {
    // 自定义组件渲染
    if (section.type === 'custom' && section.component) {
      const Component = section.component
      return (
        <Card key={index} size="small" className="mb-4">
          <Card.Meta
            title={section.section}
            description={section.description}
          />
          <div className="mt-4">
            <Component values={values} onChange={onChange} />
          </div>
        </Card>
      )
    }

    // 标准设置项渲染
    return (
      <Card key={index} size="small" className="mb-4">
        <Card.Meta
          title={section.section}
          description={section.description}
        />
        <div className="mt-4">
          <Row gutter={16}>
            {section.items?.map((item) => (
              <Col xs={24} md={12} key={item.key}>
                {renderSettingItem(item)}
              </Col>
            ))}
          </Row>
        </div>
      </Card>
    )
  }

  // 如果配置了多个分区，使用 Tabs 展示
  if (config.settings.length > 1) {
    const tabItems = config.settings.map((section, index) => ({
      key: String(index),
      label: section.section,
      children: renderSection(section, index),
    }))

    return (
      <Form
        form={form}
        layout="vertical"
        onValuesChange={handleValuesChange}
      >
        <Tabs items={tabItems} type="card" />
        <div className="mt-4">
          <Button
            type="primary"
            onClick={handleSave}
            loading={saving}
            disabled={loading}
          >
            保存配置
          </Button>
        </div>
      </Form>
    )
  }

  // 单分区直接渲染
  return (
    <Form
      form={form}
      layout="vertical"
      onValuesChange={handleValuesChange}
    >
      {config.settings.map((section, index) => renderSection(section, index))}
      <div className="mt-4">
        <Button
          type="primary"
          onClick={handleSave}
          loading={saving}
          disabled={loading}
        >
          保存配置
        </Button>
      </div>
    </Form>
  )
}
